import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { MessageSquare, Minus, X, Send, GripHorizontal, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * AgentDock — floating, draggable chat panel for the APX agents. PREVIEW build.
 *
 * Drop-in: <AgentDock /> once, near the root of a layout.
 *
 * Palette is hard-coded hex on purpose, matching PreviewDashboard's blue/gold —
 * it does not read dash-theme.js tokens (those are violet/indigo).
 *
 * Talks to /api/agentChat via base44.functions.invoke("agentChat", ...), the
 * same auth'd-fetch wrapper the rest of the app uses. Expected body:
 *   { agent_name: "maya" | "atlas", messages: [{role, content}] }
 * Response is { messages: [...messages, {role: "assistant", content}] }.
 */

const AGENTS = {
  maya: {
    id: "maya",
    name: "Maya",
    role: "Campaigns & creative",
    accent: "#F5B942",
    accentSoft: "rgba(245, 185, 66, 0.14)",
    initials: "M",
    greeting: "Ask me about campaign performance, creatives, or niche picks.",
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    role: "Traffic & analytics",
    accent: "#38D9E8",
    accentSoft: "rgba(56, 217, 232, 0.14)",
    initials: "A",
    greeting: "Ask me about traffic sources, EPC trends, or payout math.",
  },
};

const PANEL_W = 372;
const PANEL_H = 528;
const EDGE_GAP = 16;
const MOBILE_BP = 768;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function useDraggable({ width, height, enabled }) {
  const [pos, setPos] = useState(null);
  const dragState = useRef(null);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    if (pos !== null) return;
    setPos({
      x: Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP),
      y: Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP),
    });
  }, [pos, width, height]);

  useEffect(() => {
    function onResize() {
      setPos((p) =>
        p === null
          ? p
          : {
              x: clamp(p.x, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
              y: clamp(p.y, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP)),
            }
      );
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width, height]);

  const onPointerMove = useCallback(
    (e) => {
      const s = dragState.current;
      if (!s) return;
      setPos({
        x: clamp(e.clientX - s.dx, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
        y: clamp(e.clientY - s.dy, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP)),
      });
    },
    [width, height]
  );

  const endDrag = useCallback(() => {
    dragState.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (e) => {
      if (!enabled || !pos) return;
      if (e.button !== undefined && e.button !== 0) return;
      dragState.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      setDragging(true);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [enabled, pos, onPointerMove, endDrag]
  );

  const nudge = useCallback(
    (e) => {
      if (!enabled) return;
      const step = e.shiftKey ? 40 : 12;
      const moves = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[e.key];
      if (!move) return;
      e.preventDefault();
      setPos((p) =>
        p === null
          ? p
          : {
              x: clamp(p.x + move[0], EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
              y: clamp(p.y + move[1], EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP)),
            }
      );
    },
    [enabled, width, height]
  );

  useEffect(() => endDrag, [endDrag]);

  return { pos, dragging, startDrag, nudge };
}

function useIsMobile() {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BP : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`);
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    setMobile(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

async function sendToAgent({ agentId, message, history }) {
  const messages = [...history, { role: "user", content: message }];
  const { data } = await base44.functions.invoke("agentChat", {
    agent_name: agentId,
    messages,
  });

  const reply = data?.messages?.[data.messages.length - 1];
  if (!reply?.content) throw new Error("Agent returned an empty response.");
  return reply.content;
}

function Avatar({ agent, size = 32 }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-[#07182E]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(140deg, ${agent.accent}, ${agent.accent}99)`,
        boxShadow: `0 0 0 1px ${agent.accent}55, 0 4px 14px -4px ${agent.accent}80`,
      }}
      aria-hidden="true"
    >
      {agent.initials}
    </span>
  );
}

function AgentTab({ agent, active, onSelect }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(agent.id)}
      className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B2244] motion-reduce:transition-none"
      style={{
        background: active ? agent.accentSoft : "transparent",
        color: active ? "#EAF3FF" : "#8FAECE",
        boxShadow: active ? `inset 0 0 0 1px ${agent.accent}44` : "none",
        "--tw-ring-color": agent.accent,
      }}
    >
      <Avatar agent={agent} size={24} />
      <span className="min-w-0">
        <span className="block font-medium leading-tight">{agent.name}</span>
        <span className="block truncate text-[11px] leading-tight opacity-70">{agent.role}</span>
      </span>
    </button>
  );
}

function Bubble({ turn, agent }) {
  const mine = turn.role === "user";

  if (turn.role === "error") {
    return (
      <p className="rounded-lg border border-[#F5B94233] bg-[#F5B9420F] px-3 py-2 text-[13px] leading-relaxed text-[#F5C97A]">
        {turn.content}
      </p>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && <Avatar agent={agent} size={26} />}
      <div
        className="max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
        style={
          mine
            ? { background: "#1B4A87", color: "#EAF3FF", borderBottomRightRadius: 6 }
            : {
                background: "#0E2C55",
                color: "#D8E8FA",
                borderBottomLeftRadius: 6,
                boxShadow: `inset 0 0 0 1px ${agent.accent}26`,
              }
        }
      >
        {turn.content}
      </div>
    </div>
  );
}

export default function AgentDock() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState("maya");
  const [threads, setThreads] = useState({ maya: [], atlas: [] });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const isMobile = useIsMobile();
  const agent = AGENTS[activeId];
  const turns = threads[activeId];

  const height = collapsed ? 56 : PANEL_H;
  const { pos, dragging, startDrag, nudge } = useDraggable({
    width: PANEL_W,
    height,
    enabled: !isMobile,
  });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending, collapsed]);

  useEffect(() => {
    if (open && !collapsed) inputRef.current?.focus();
  }, [open, collapsed, activeId]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || pending) return;

    const history = turns
      .filter((t) => t.role !== "error")
      .map(({ role, content }) => ({ role, content }));

    setThreads((t) => ({ ...t, [activeId]: [...t[activeId], { role: "user", content: text }] }));
    setDraft("");
    setPending(true);

    try {
      const reply = await sendToAgent({ agentId: activeId, message: text, history });
      setThreads((t) => ({
        ...t,
        [activeId]: [...t[activeId], { role: "assistant", content: reply }],
      }));
    } catch (err) {
      setThreads((t) => ({
        ...t,
        [activeId]: [
          ...t[activeId],
          {
            role: "error",
            content: `${agent.name} is not responding. Check that ANTHROPIC_API_KEY is set in Vercel, then try again.`,
          },
        ],
      }));
      console.error("[AgentDock]", err);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open agent chat"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-[#07182E] transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B942] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07182E] motion-reduce:transition-none motion-reduce:hover:scale-100"
        style={{
          background: "linear-gradient(135deg, #F5B942, #E09A2C)",
          boxShadow: "0 10px 30px -8px rgba(245,185,66,0.6)",
        }}
      >
        <MessageSquare size={17} strokeWidth={2.2} />
        Agents
      </button>
    );
  }

  const frame = isMobile
    ? {
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: collapsed ? 56 : "min(72vh, 560px)",
        borderRadius: "18px 18px 0 0",
      }
    : {
        left: pos?.x ?? -9999,
        top: pos?.y ?? -9999,
        width: PANEL_W,
        height,
        borderRadius: 16,
      };

  return (
    <section
      role="dialog"
      aria-label={`${agent.name} chat`}
      className="fixed z-50 flex flex-col overflow-hidden border border-[#1E4C86] backdrop-blur-md"
      style={{
        ...frame,
        background: "linear-gradient(165deg, #0B2244 0%, #071A35 100%)",
        boxShadow: dragging
          ? "0 26px 60px -18px rgba(0,0,0,0.75)"
          : "0 18px 44px -16px rgba(0,0,0,0.6)",
        transition: dragging ? "none" : "height 180ms ease, box-shadow 180ms ease",
      }}
    >
      <header
        onPointerDown={isMobile ? undefined : startDrag}
        onKeyDown={nudge}
        tabIndex={isMobile ? -1 : 0}
        role={isMobile ? undefined : "button"}
        aria-label={isMobile ? undefined : "Move panel — use arrow keys"}
        className={`flex shrink-0 items-center gap-2 border-b border-[#17406F] px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5B942] ${
          isMobile ? "" : dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{ background: "linear-gradient(90deg, #0E2C55, #0B2244)", touchAction: "none" }}
      >
        {!isMobile && <GripHorizontal size={15} className="shrink-0 text-[#5C87B8]" aria-hidden="true" />}
        <h2 className="mr-auto truncate text-[13px] font-semibold tracking-wide text-[#EAF3FF]">
          Agents
        </h2>
        <span className="mr-1 flex items-center gap-1.5 text-[11px] text-[#7FA5CC]">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: agent.accent, boxShadow: `0 0 6px ${agent.accent}` }}
          />
          {agent.name}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          className="grid h-7 w-7 place-items-center rounded-md text-[#8FAECE] transition-colors hover:bg-[#17406F] hover:text-[#EAF3FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B942] motion-reduce:transition-none"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close agent chat"
          className="grid h-7 w-7 place-items-center rounded-md text-[#8FAECE] transition-colors hover:bg-[#17406F] hover:text-[#EAF3FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B942] motion-reduce:transition-none"
        >
          <X size={15} />
        </button>
      </header>

      {!collapsed && (
        <>
          <div role="tablist" aria-label="Choose agent" className="flex gap-1.5 border-b border-[#17406F] px-2 py-2">
            {Object.values(AGENTS).map((a) => (
              <AgentTab key={a.id} agent={a} active={a.id === activeId} onSelect={setActiveId} />
            ))}
          </div>

          <div
            ref={scrollRef}
            aria-live="polite"
            className="flex-1 space-y-3 overflow-y-auto px-3 py-3.5"
          >
            {turns.length === 0 && (
              <div className="flex items-start gap-2">
                <Avatar agent={agent} size={26} />
                <p className="max-w-[78%] rounded-2xl rounded-bl-md bg-[#0E2C55] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#9CBCDC]">
                  {agent.greeting}
                </p>
              </div>
            )}

            {turns.map((turn, i) => (
              <Bubble key={i} turn={turn} agent={agent} />
            ))}

            {pending && (
              <div className="flex items-center gap-2 pl-1 text-[12px] text-[#7FA5CC]">
                <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />
                {agent.name} is thinking…
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[#17406F] p-2.5">
            <div className="flex items-end gap-2 rounded-xl border border-[#1E4C86] bg-[#081E3C] p-1.5 focus-within:border-[#2E6BB0]">
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Message ${agent.name}…`}
                aria-label={`Message ${agent.name}`}
                className="max-h-24 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-[#EAF3FF] placeholder:text-[#5C87B8] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim() || pending}
                aria-label="Send message"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#07182E] transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
                style={{ background: `linear-gradient(135deg, ${agent.accent}, ${agent.accent}CC)` }}
              >
                <Send size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
