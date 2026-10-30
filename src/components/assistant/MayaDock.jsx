import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Send, X, Maximize2, Minimize2, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAssistantSession } from "@/lib/AssistantSessionProvider";
import { ReplyMarkdown } from "@/components/dashboard/VoiceAtlas";
import { cn } from "@/lib/utils";

const MAYA_DEFAULT = "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";

// Maya follows the user around the app instead of living behind one button on
// one screen. She is mounted in AppLayout, outside the router's Outlet, so
// navigating pages never unmounts her and the conversation keeps going.
//
// Deliberately text-only: the voice path in VoiceAtlas auto-starts the mic and
// plays audio on mount, which is fine for a modal someone opened on purpose
// and wrong for something always present on every page. The full voice
// experience is still one tap away in the top bar.
//
// The session metadata matches VoiceAtlas's exactly, so this dock and the full
// modal share one conversation -- ask Maya something here, open the big window,
// and she remembers it.
const SESSION_META = { name: "Maya Voice Session", assistant: "maya", experience_level: undefined };

// What to call the page the user is on, so Maya can answer "what do I do here?"
// without the user having to explain where they are.
const PAGE_NAMES = {
  "/": "Dashboard",
  "/make-money": "Make Money",
  "/products": "Products",
  "/links": "Links",
  "/campaigns": "Campaigns",
  "/analytics": "Analytics",
  "/payouts": "Payouts",
  "/autopilot": "AutoPilot Studio",
  "/ad-tracker": "Ad Tracker",
  "/social": "Social Connect",
  "/networks": "Networks",
  "/application-profile": "Application Profile",
  "/vendor-applications": "Vendor Applications",
  "/pricing": "Pricing",
  "/admin": "Admin Panel",
};

function readAssistantText(messages = [], previousAssistantCount = 0) {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length <= previousAssistantCount) return "";
  const last = assistantMsgs[assistantMsgs.length - 1];
  if (!last) return "";
  if (typeof last.content === "string") return last.content.trim();
  if (Array.isArray(last.content)) {
    return last.content.map((b) => (typeof b === "string" ? b : b?.text || "")).join("").trim();
  }
  return "";
}

export default function MayaDock() {
  const location = useLocation();
  const { getOrInitConversation, saveConversation } = useAssistantSession();

  // "closed" | "compact" | "expanded", remembered between visits.
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("mayaDockMode");
    return saved === "compact" || saved === "expanded" ? saved : "closed";
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const experienceLevel = localStorage.getItem("affiliateProExperienceLevel") || "new";
  const sessionMeta = { ...SESSION_META, experience_level: experienceLevel };

  const scrollRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => { localStorage.setItem("mayaDockMode", mode); }, [mode]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const { data: avatars = [] } = useQuery({
    queryKey: ["assistant-avatars"],
    queryFn: () => base44.entities.AssistantAvatar.list(),
    staleTime: 5 * 60 * 1000,
  });
  const mayaAvatar = avatars.find((a) => a.assistant === "maya")?.file_url || MAYA_DEFAULT;

  const pageName = PAGE_NAMES[location.pathname] || null;

  const send = useCallback(async (raw) => {
    const text = raw.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    const whereTheyAre = pageName
      ? `[The user is currently on the ${pageName} page (${location.pathname}). If their question is about what they are looking at, answer about that page. Do not mention these bracketed notes.]`
      : "";
    const directive =
      "[You are Maya only: warm, compassionate, calm, and supportive. Do not use Atlas's voice, name, or coaching style. Keep answers short -- this is a small chat window.]";
    const payload = `${directive}\n[User experience level: ${experienceLevel}.]\n${whereTheyAre}\n\n${text}`;

    try {
      const conversation = await getOrInitConversation("maya", sessionMeta);
      if (!conversation?.id) throw new Error("Could not start Maya's session");

      const baseline = (conversation.messages || []).filter((m) => m.role === "assistant").length;
      const updated = await base44.agents.addMessage(conversation, { role: "user", content: payload });

      if (updated?.id) saveConversation("maya", sessionMeta, updated);
      if (!mountedRef.current) return;

      const replyText =
        readAssistantText(updated?.messages || updated?.data?.messages || [], baseline) ||
        "I'm still working on that one -- try asking again.";
      setMessages((prev) => [...prev, { role: "assistant", text: replyText }]);
    } catch (err) {
      console.error("Maya dock send failed:", err);
      if (mountedRef.current) {
        setMessages((prev) => [...prev, { role: "assistant", text: "I couldn't reach my brain just then. Try again in a moment." }]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // sessionMeta is rebuilt each render from a localStorage read; including it
    // would re-create this callback every render for no behavioural gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pageName, location.pathname, experienceLevel, getOrInitConversation, saveConversation]);

  // Other screens open Maya with a ready-made question by firing
  // `apx:ask-maya` (e.g. a dashboard card's "Ask Maya about this").
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onAsk = (e) => {
      const text = e.detail?.text;
      if (!text) return;
      setMode((m) => (m === "closed" ? "compact" : m));
      sendRef.current(text);
    };
    window.addEventListener("apx:ask-maya", onAsk);
    return () => window.removeEventListener("apx:ask-maya", onAsk);
  }, []);

  if (mode === "closed") {
    return (
      <button
        onClick={() => setMode("compact")}
        aria-label="Open Maya, your assistant"
        className="fixed bottom-20 right-4 lg:right-6 z-40 flex items-center gap-2 rounded-full pl-1.5 pr-4 py-1.5 shadow-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.95), rgba(168,85,247,0.95))" }}
      >
        <img src={mayaAvatar} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white/60" />
        <span className="text-sm font-semibold text-white">Ask Maya</span>
      </button>
    );
  }

  const expanded = mode === "expanded";

  return (
    <div
      className={cn(
        "fixed z-40 flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-white/15",
        "bottom-20 right-4 lg:right-6",
        expanded
          ? "w-[min(38rem,calc(100vw-2rem))] h-[min(40rem,calc(100vh-8rem))]"
          : "w-[min(23rem,calc(100vw-2rem))] h-[min(30rem,calc(100vh-8rem))]"
      )}
      style={{ background: "linear-gradient(160deg, #0b0820 0%, #1a1240 100%)" }}
    >
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/10 flex-shrink-0"
        style={{ background: "linear-gradient(90deg, rgba(236,72,153,0.35), rgba(168,85,247,0.25))" }}
      >
        <img src={mayaAvatar} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-pink-300/60" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-tight">Maya</p>
          <p className="text-[11px] text-pink-100/70 leading-tight truncate">
            {pageName ? `Here with you on ${pageName}` : "Here to help"}
          </p>
        </div>
        <button
          onClick={() => setMode(expanded ? "compact" : "expanded")}
          aria-label={expanded ? "Shrink Maya's window" : "Expand Maya's window"}
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setMode("closed")}
          aria-label="Close Maya's window"
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center px-3 py-6">
            <MessageCircle className="w-7 h-7 mx-auto text-pink-300/60 mb-2" />
            <p className="text-sm text-white/80 font-medium">I'm right here.</p>
            <p className="text-xs text-white/50 mt-1">
              {pageName ? `Ask me anything about ${pageName}, or about your account.` : "Ask me anything about your account."}
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                m.role === "user" ? "bg-white/15 text-white" : "bg-white/[0.07] text-pink-50"
              )}
            >
              {m.role === "assistant" ? <ReplyMarkdown text={m.text} /> : m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3 py-2 bg-white/[0.07] flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-200" />
              <span className="text-xs text-pink-100/70">Maya is thinking…</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-center gap-2 p-2.5 border-t border-white/10 flex-shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Maya…"
          aria-label="Message Maya"
          className="flex-1 min-w-0 bg-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-pink-400/60"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label="Send"
          className="p-2 rounded-xl text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{ background: "linear-gradient(135deg, #ec4899, #a855f7)" }}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
