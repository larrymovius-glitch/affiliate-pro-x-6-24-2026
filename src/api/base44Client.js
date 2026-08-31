import { supabase } from "@/lib/supabaseClient";
import { TABLES as ENTITY_TABLES } from "../../api/_lib/tables.js";

// ---------------------------------------------------------------------------
// Drop-in replacement for the old @base44/sdk client. Same call shapes
// (`.list()`, `.filter()`, `.create()`, `.update()`, `.delete()`,
// `base44.auth.me()`, `base44.functions.invoke()`) so none of the ~30 pages
// and components that import `{ base44 } from "@/api/base44Client"` need to
// change — only this file's internals moved from Base44 to Supabase + Vercel.
// ---------------------------------------------------------------------------

function parseSort(sortStr) {
  if (!sortStr || typeof sortStr !== "string") return null;
  const descending = sortStr.startsWith("-");
  return { field: descending ? sortStr.slice(1) : sortStr, ascending: !descending };
}

function makeEntityClient(entityName) {
  const table = ENTITY_TABLES[entityName] || entityName;

  return {
    async list(sort, limit) {
      let q = supabase.from(table).select("*");
      const s = parseSort(sort);
      if (s) q = q.order(s.field, { ascending: s.ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    async filter(query = {}, sort, limit) {
      let q = supabase.from(table).select("*");
      for (const [key, value] of Object.entries(query || {})) {
        q = q.eq(key, value);
      }
      const s = parseSort(sort);
      if (s) q = q.order(s.field, { ascending: s.ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },

    async create(payload) {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return true;
    },
  };
}

/**
 * What `makeEntityClient` hands back. The Proxy below returns one of these for
 * any entity name, which TypeScript can't infer from `new Proxy({}, ...)` — so
 * the Record annotation is what lets `base44.entities.<Anything>` type-check.
 *
 * @typedef {object} EntityClient
 * @property {(sort?: string, limit?: number) => Promise<any[]>} list
 * @property {(query?: Record<string, any>, sort?: string, limit?: number) => Promise<any[]>} filter
 * @property {(id: string) => Promise<any>} get
 * @property {(payload: Record<string, any>) => Promise<any>} create
 * @property {(id: string, payload: Record<string, any>) => Promise<any>} update
 * @property {(id: string) => Promise<boolean>} delete
 */

/** @type {Record<string, EntityClient>} */
const entities = new Proxy(
  {},
  {
    get(_target, entityName) {
      return makeEntityClient(String(entityName));
    },
  }
);

// ---------------------------------------------------------------------------
// Auth — most pages now use useAuth() from AuthContext, but a few call
// base44.auth.* directly. Keep them working against Supabase + profiles.
// ---------------------------------------------------------------------------
const auth = {
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    return { id: user.id, email: user.email, ...(profile || {}) };
  },

  async updateMe(payload) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase.from("profiles").update(payload).eq("id", user.id).select().single();
    if (error) throw error;
    return data;
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    window.location.href = redirectUrl || "/login";
  },
};

// ---------------------------------------------------------------------------
// Functions — every base44.functions.invoke("name", payload) call now hits
// a Vercel serverless route at /api/name, authenticated with the user's
// Supabase access token.
// ---------------------------------------------------------------------------
const functions = {
  async invoke(name, payload = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Function "${name}" failed`);
    return { data };
  },
};

// ---------------------------------------------------------------------------
// Integrations — file upload goes straight to Supabase Storage. LLM/speech
// need a server-side API key, so they proxy through Vercel routes just like
// functions.invoke.
// ---------------------------------------------------------------------------
const UPLOAD_BUCKET = "uploads";

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const path = `${Date.now()}-${file.name}`.replace(/\s+/g, "_");
      const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
      return { file_url: pub.publicUrl };
    },

    async InvokeLLM(payload) {
      const result = await functions.invoke("invokeLLM", payload);
      return result.data;
    },

    async GenerateSpeech(payload) {
      const result = await functions.invoke("generatePremiumSpeech", payload);
      return result.data;
    },
  },
};

// ---------------------------------------------------------------------------
// Agents — backs the Maya/Atlas voice assistants. Anthropic's API is
// stateless, so there's no server-side chat session to create; each turn
// round-trips the full history through /api/agentChat. The history itself
// persists in assistant_conversations, one row per (user, agent, session
// key) — without that, memory lived only in a React ref in
// AssistantSessionProvider, which a page reload (or a mobile browser
// silently reloading a backgrounded tab) wiped completely: the assistant
// forgot everything mid-conversation with no visible cause. There's no
// server push channel, so subscribeToConversation is a no-op — the reply is
// delivered through addMessage's resolved promise.
// ---------------------------------------------------------------------------

function conversationSessionKey(agent_name, metadata = {}) {
  return metadata.session_key || `${agent_name}:${metadata.experience_level || "default"}`;
}

const agents = {
  /** @param {{ agent_name?: string, metadata?: Record<string, any> }} [options] */
  async createConversation({ agent_name, metadata } = {}) {
    const sessionKey = conversationSessionKey(agent_name, metadata);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: existing } = await supabase
        .from("assistant_conversations")
        .select("id, messages")
        .eq("agent_name", agent_name)
        .eq("session_key", sessionKey)
        .maybeSingle();
      if (existing) return { id: existing.id, agent_name, metadata, messages: existing.messages || [] };

      const { data: created, error } = await supabase
        .from("assistant_conversations")
        .insert({ agent_name, session_key: sessionKey, messages: [] })
        .select("id")
        .single();
      if (!error && created?.id) return { id: created.id, agent_name, metadata, messages: [] };
    }
    // Signed out, or the row couldn't be created -- fall back to an
    // in-memory-only conversation so the assistant still works this turn,
    // just without anything to reload on the next one.
    return { id: crypto.randomUUID(), agent_name, metadata, messages: [] };
  },

  subscribeToConversation(_conversationId, _onUpdate) {
    return () => {};
  },

  async addMessage(conversation, message) {
    const messages = [...(conversation?.messages || []), message];
    const result = await functions.invoke("agentChat", {
      agent_name: conversation?.agent_name,
      messages,
    });
    const updated = { ...conversation, messages: result.data.messages };
    // Best-effort: never let a save failure block the reply already on
    // screen. A conversation id from the in-memory fallback above matches no
    // row, so this is a harmless no-op update in that case.
    if (conversation?.id) {
      supabase.from("assistant_conversations").update({ messages: updated.messages }).eq("id", conversation.id)
        .then(({ error }) => { if (error) console.warn("Conversation save failed:", error); });
    }
    return updated;
  },
};

export const base44 = { entities, auth, functions, integrations, agents };
export default base44;
