import { supabase } from "@/lib/supabaseClient";

// ---------------------------------------------------------------------------
// Drop-in replacement for the old @base44/sdk client. Same call shapes
// (`.list()`, `.filter()`, `.create()`, `.update()`, `.delete()`,
// `base44.auth.me()`, `base44.functions.invoke()`) so none of the ~30 pages
// and components that import `{ base44 } from "@/api/base44Client"` need to
// change — only this file's internals moved from Base44 to Supabase + Vercel.
// ---------------------------------------------------------------------------

const ENTITY_TABLE_MAP = {
  AdAsset: "ad_assets",
  AdReview: "ad_reviews",
  AffiliateLink: "affiliate_links",
  AssistantAvatar: "assistant_avatars",
  Campaign: "campaigns",
  ClickEvent: "click_events",
  ConversionEvent: "conversion_events",
  EbayToken: "ebay_tokens",
  GeneratedPost: "generated_posts",
  GoogleReviewer: "google_reviewers",
  Notification: "notifications",
  Payout: "payouts",
  PayoutSchedule: "payout_schedules",
  ProAutomationRule: "pro_automation_rules",
  Product: "products",
  User: "profiles",
};

function parseSort(sortStr) {
  if (!sortStr || typeof sortStr !== "string") return null;
  const descending = sortStr.startsWith("-");
  return { field: descending ? sortStr.slice(1) : sortStr, ascending: !descending };
}

function makeEntityClient(entityName) {
  const table = ENTITY_TABLE_MAP[entityName] || entityName;

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
// functions.invoke. `custom.call` only ever gets used for one legacy path
// (fetching affiliate links); routed straight to the real table.
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

  custom: {
    async call(slug, path) {
      if (slug === "affiliate-pro-api" && path === "get:/api/links") {
        const { data, error } = await supabase
          .from("affiliate_links")
          .select("*")
          .order("created_date", { ascending: false });
        if (error) throw error;
        return { data: { links: data || [] } };
      }
      throw new Error(`Unsupported custom integration call: ${slug} ${path}`);
    },
  },
};

export const base44 = { entities, auth, functions, integrations };
export default base44;
