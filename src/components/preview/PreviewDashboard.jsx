import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { startHereComplete, startHereSteps } from "@/lib/startHere";
import StartHere from "@/components/onboarding/StartHere";
import { buildPerformanceChartData } from "@/lib/performance-calculations";
import { RANGES, rangeById, rangeSummary, topProducts, toCsv, greetingFor } from "@/lib/dashboard-ranges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, TrendingUp, TrendingDown, ArrowUpRight, Sparkles, Download } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/**
 * PreviewDashboard — blue/gold dashboard content, live at "/" inside the
 * app's normal AppLayout shell (Sidebar/TopBar/BottomNav) — same navigation,
 * "Ask Maya" chat, and Admin Panel access as every other page.
 *
 * Wired to real Supabase data via `useOverviewData` below (AffiliateLink,
 * ClickEvent, ConversionEvent). Each card's "⋮" menu switches its own time
 * range (`src/lib/dashboard-ranges.js`), opens the page with the details, or
 * hands Maya a ready-made question about that card's numbers.
 *
 * Requires: recharts, lucide-react (both already in package.json).
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#071A35",
  panel: "#0B2244",
  card: "#0E2C55",
  cardTop: "#12356A",
  line: "#17406F",
  lineBright: "#1E4C86",
  gold: "#F5B942",
  goldDeep: "#E09A2C",
  cyan: "#38D9E8",
  teal: "#34D399",
  text: "#EAF3FF",
  muted: "#8FAECE",
  dim: "#5C87B8",
  up: "#5FD69A",
};

// Soft atmospheric glow over the navy background — pure CSS, no images, so
// it costs nothing in load time or performance on mobile.
const BG_GLOW = {
  backgroundColor: C.bg,
  backgroundImage: [
    "radial-gradient(ellipse 70% 40% at 20% -10%, rgba(56,217,232,0.10), transparent 60%)",
    "radial-gradient(ellipse 55% 35% at 85% 5%, rgba(245,185,66,0.09), transparent 60%)",
    "radial-gradient(ellipse 70% 50% at 50% 115%, rgba(52,211,153,0.07), transparent 60%)",
  ].join(", "),
};

// Soft neon glow on chart lines (CSS filter on recharts' own path classes).
const LINE_GLOW =
  "[&_.recharts-curve]:[filter:drop-shadow(0_0_5px_rgba(56,217,232,0.55))] [&_.recharts-area-curve]:[filter:drop-shadow(0_0_5px_rgba(245,185,66,0.6))]";

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return undefined;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Counts a number up from where it was to its new value. */
function CountUp({ value, format = (n) => Math.round(n).toLocaleString() }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    const DURATION = 900;
    let frame;
    const tick = (t) => {
      const p = Math.min((t - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return <>{format(shown)}</>;
}

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

function formatDelta(pct) {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function askMaya(text) {
  window.dispatchEvent(new CustomEvent("apx:ask-maya", { detail: { text } }));
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Live data                                                           */
/* ------------------------------------------------------------------ */

function useOverviewData() {
  const linksQ = useQuery({ queryKey: ["links"], queryFn: () => base44.entities.AffiliateLink.list("-created_at", 200) });
  const clicksQ = useQuery({ queryKey: ["click-events"], queryFn: () => base44.entities.ClickEvent.list("-clicked_at", 1000) });
  const convQ = useQuery({ queryKey: ["conversion-events"], queryFn: () => base44.entities.ConversionEvent.list("-converted_at", 1000) });

  return {
    loading: linksQ.isLoading || clicksQ.isLoading || convQ.isLoading,
    links: linksQ.data || [],
    clickEvents: clicksQ.data || [],
    conversionEvents: convQ.data || [],
  };
}

/** One card's range choice plus its numbers for that range. */
function useCardRange(d, initial = "all") {
  const [rangeId, setRangeId] = useState(initial);
  const range = rangeById(rangeId);
  const summary = useMemo(
    () => rangeSummary({ links: d.links, clickEvents: d.clickEvents, conversionEvents: d.conversionEvents, days: range.days }),
    [d.links, d.clickEvents, d.conversionEvents, range.days]
  );
  // Sparkline: the chosen range, or the last 12 days for "All time".
  const series = useMemo(
    () => buildPerformanceChartData(d.clickEvents, d.conversionEvents, range.days || 12).map((r, i) => ({ i, ...r })),
    [d.clickEvents, d.conversionEvents, range.days]
  );
  return { rangeId, setRangeId, range, summary, series };
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

function CardMenu({ title, ranges, rangeId, onRange, actions = [] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${title} options`}
          className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[#1E4C86] data-[state=open]:bg-[#1E4C86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B942] motion-reduce:transition-none"
          style={{ color: C.muted }}
        >
          <MoreVertical size={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 rounded-xl border-[#1E4C86] bg-[#0B2244]/95 p-1.5 text-[#EAF3FF] shadow-2xl backdrop-blur-md"
      >
        {ranges && (
          <>
            <DropdownMenuLabel className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wider text-[#8FAECE]">
              Show
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={rangeId} onValueChange={onRange}>
              {ranges.map((r) => (
                <DropdownMenuRadioItem
                  key={r.id}
                  value={r.id}
                  className="rounded-md text-[13px] focus:bg-[#17406F] focus:text-[#EAF3FF] data-[state=checked]:text-[#F5B942]"
                >
                  {r.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {actions.length > 0 && <DropdownMenuSeparator className="bg-[#1E4C86]" />}
          </>
        )}
        {actions.map(({ label, icon: Icon, onSelect }) => (
          <DropdownMenuItem
            key={label}
            onSelect={onSelect}
            className="rounded-md text-[13px] focus:bg-[#17406F] focus:text-[#EAF3FF]"
          >
            <Icon size={14} style={{ color: C.gold }} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Card({ title, subtitle, children, className = "", tall = false, menu, delay = 0 }) {
  // The entrance animation sits on a wrapper: a finished animation keeps its
  // last transform, which would otherwise cancel the hover lift.
  return (
    <div
      className={`animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700 motion-reduce:animate-none ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
    <section
      className="group relative h-full overflow-hidden rounded-2xl border p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(245,185,66,0.65)] hover:shadow-[0_22px_45px_-22px_rgba(245,185,66,0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{
        borderColor: "rgba(245,185,66,0.3)",
        background: `linear-gradient(160deg, rgba(18,53,106,0.88) 0%, rgba(14,44,85,0.72) 100%)`,
        boxShadow: "0 12px 28px -18px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Gold sheen along the top edge, brighter on hover. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px opacity-60 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)` }}
      />
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2
            className={`font-medium ${tall ? "text-[14px]" : "text-[12px]"}`}
            style={{ color: tall ? C.text : C.muted }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-[10.5px]" style={{ color: C.dim }}>
              {subtitle}
            </p>
          )}
        </div>
        {menu && <CardMenu title={title} {...menu} />}
      </div>
      {children}
    </section>
    </div>
  );
}

const DOWN_COLOR = "#F0806B";

function Delta({ value }) {
  const isDown = typeof value === "string" && value.trim().startsWith("-");
  const Icon = isDown ? TrendingDown : TrendingUp;
  return (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: isDown ? DOWN_COLOR : C.up }}>
      <Icon size={12} strokeWidth={2.5} />
      {value}
    </span>
  );
}

function Figure({ children, delta, sub }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <p className="text-[28px] font-bold leading-none tracking-tight tabular-nums" style={{ color: C.text, textShadow: "0 0 18px rgba(56,217,232,0.25)" }}>
        {children}
      </p>
      {delta && <Delta value={delta} />}
      {sub && (
        <span className="text-[11px]" style={{ color: C.dim }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function rangeSubtitle(range) {
  return range.days ? `${range.label} · vs the ${range.days} days before` : "All time · change is this week vs last";
}

function EarningsCard({ d, reduced }) {
  const navigate = useNavigate();
  const { rangeId, setRangeId, range, summary, series } = useCardRange(d);
  return (
    <Card
      title="Total Earnings"
      subtitle={rangeSubtitle(range)}
      delay={0}
      menu={{
        ranges: RANGES,
        rangeId,
        onRange: setRangeId,
        actions: [
          { label: "See payouts", icon: ArrowUpRight, onSelect: () => navigate("/payouts") },
          {
            label: "Ask Maya about this",
            icon: Sparkles,
            onSelect: () =>
              askMaya(`My dashboard shows ${money(summary.earnings)} in earnings (${range.label.toLowerCase()}). What is one thing I can do this week to earn more commissions?`),
          },
        ],
      }}
    >
      <Figure delta={formatDelta(summary.earningsDelta)}>
        <CountUp value={summary.earnings} format={money} />
      </Figure>
      <div className={`h-11 ${LINE_GLOW}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} stopOpacity={0.55} />
                <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="earnings"
              stroke={C.gold}
              strokeWidth={2}
              fill="url(#earnFill)"
              dot={false}
              isAnimationActive={!reduced}
              animationDuration={1100}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ConversionsCard({ d, reduced }) {
  const navigate = useNavigate();
  const { rangeId, setRangeId, range, summary, series } = useCardRange(d);
  return (
    <Card
      title="Conversions"
      subtitle={rangeSubtitle(range)}
      delay={80}
      menu={{
        ranges: RANGES,
        rangeId,
        onRange: setRangeId,
        actions: [
          { label: "See details", icon: ArrowUpRight, onSelect: () => navigate("/analytics") },
          {
            label: "Ask Maya about this",
            icon: Sparkles,
            onSelect: () =>
              askMaya(`I have ${summary.conversions} conversions from ${summary.clicks} clicks (${range.label.toLowerCase()}). Why might clicks not be turning into sales, and what should I try?`),
          },
        ],
      }}
    >
      <Figure delta={formatDelta(summary.conversionsDelta)}>
        <CountUp value={summary.conversions} />
      </Figure>
      <div className="h-11">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barGap={2}>
            <defs>
              <linearGradient id="convBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} />
                <stop offset="100%" stopColor={C.goldDeep} stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <Bar dataKey="conversions" fill="url(#convBar)" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} animationDuration={900} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TrafficCard({ d, reduced }) {
  const navigate = useNavigate();
  const { rangeId, setRangeId, range, summary, series } = useCardRange(d);
  return (
    <Card
      title="Traffic"
      subtitle={rangeSubtitle(range)}
      delay={160}
      menu={{
        ranges: RANGES,
        rangeId,
        onRange: setRangeId,
        actions: [
          { label: "See details", icon: ArrowUpRight, onSelect: () => navigate("/analytics") },
          {
            label: "Ask Maya about this",
            icon: Sparkles,
            onSelect: () =>
              askMaya(`I had ${summary.visitors} visitors and ${summary.clicks} clicks (${range.label.toLowerCase()}). Which of my products should I post about next to get more clicks?`),
          },
        ],
      }}
    >
      <Figure sub="Visitors" delta={formatDelta(summary.visitorsDelta)}>
        <CountUp value={summary.visitors} />
      </Figure>
      <div className={`h-11 ${LINE_GLOW}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey="clicks"
              stroke={C.cyan}
              strokeWidth={2}
              dot={false}
              isAnimationActive={!reduced}
              animationDuration={1100}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** EPC gauge — SVG arc, no chart library needed. */
function EpcCard({ d, reduced }) {
  const navigate = useNavigate();
  const { rangeId, setRangeId, range, summary } = useCardRange(d);
  // No fixed EPC target exists yet, so the gauge reads relative to a $2 EPC
  // ceiling — a reasonable placeholder scale until product defines a real one.
  const pct = Math.min(Math.max(summary.epc / 2, 0), 1);
  const R = 44;
  const CIRC = Math.PI * R; // half circle

  return (
    <Card
      title="EPC"
      subtitle={range.days ? range.label : "Earnings per click · all time"}
      delay={240}
      menu={{
        ranges: RANGES,
        rangeId,
        onRange: setRangeId,
        actions: [
          { label: "See details", icon: ArrowUpRight, onSelect: () => navigate("/analytics") },
          {
            label: "Ask Maya about this",
            icon: Sparkles,
            onSelect: () =>
              askMaya(`My EPC (earnings per click) is ${money(summary.epc)} (${range.label.toLowerCase()}). What does that mean for me, and how can I raise it?`),
          },
        ],
      }}
    >
      <div className="flex flex-col items-center pt-1">
        <svg viewBox="0 0 110 62" className="h-[62px] w-[110px]" role="img" aria-label={`EPC ${money(summary.epc)}`}>
          <defs>
            <linearGradient id="epcArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={C.goldDeep} />
              <stop offset="100%" stopColor={C.gold} />
            </linearGradient>
          </defs>
          <path d="M 11 55 A 44 44 0 0 1 99 55" fill="none" stroke="rgba(234,244,255,0.16)" strokeWidth="9" strokeLinecap="round" />
          <path
            d="M 11 55 A 44 44 0 0 1 99 55"
            fill="none"
            stroke="url(#epcArc)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${CIRC * pct} ${CIRC}`}
            style={{
              filter: "drop-shadow(0 0 4px rgba(245,185,66,0.7))",
              transition: reduced ? "none" : "stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)",
            }}
          />
        </svg>
        <p className="-mt-3 text-[24px] font-bold tracking-tight tabular-nums" style={{ color: C.text }}>
          <CountUp value={summary.epc} format={money} />
        </p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

const tooltipStyle = {
  contentStyle: {
    background: "rgba(8,30,60,0.95)",
    border: `1px solid ${C.lineBright}`,
    borderRadius: 12,
    fontSize: 12,
    padding: "6px 10px",
    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.7)",
  },
  labelStyle: { color: C.muted, marginBottom: 2 },
  itemStyle: { color: C.text },
};

const GROWTH_RANGES = RANGES.filter((r) => r.days);

function GrowthCard({ d, reduced }) {
  const navigate = useNavigate();
  const [rangeId, setRangeId] = useState("30");
  const range = rangeById(rangeId);
  const rows = useMemo(
    () => buildPerformanceChartData(d.clickEvents, d.conversionEvents, range.days),
    [d.clickEvents, d.conversionEvents, range.days]
  );
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const busiest = rows.reduce((best, r) => (r.clicks > (best?.clicks || 0) ? r : best), null);

  return (
    <Card
      title={`Campaign Growth — ${range.label}`}
      tall
      delay={320}
      menu={{
        ranges: GROWTH_RANGES,
        rangeId,
        onRange: setRangeId,
        actions: [
          {
            label: "Download CSV",
            icon: Download,
            onSelect: () =>
              downloadCsv(
                `apx-growth-${range.days}-days.csv`,
                toCsv(rows, [
                  { key: "date", label: "Date" },
                  { key: "clicks", label: "Clicks" },
                  { key: "conversions", label: "Conversions" },
                  { key: "earnings", label: "Earnings" },
                ])
              ),
          },
          { label: "See details", icon: ArrowUpRight, onSelect: () => navigate("/analytics") },
          {
            label: "Ask Maya about this",
            icon: Sparkles,
            onSelect: () =>
              askMaya(
                `Over the ${range.label.toLowerCase()} I had ${totalClicks} clicks${busiest ? `, busiest day ${busiest.date} with ${busiest.clicks}` : ""}. What do you notice, and what should I post next?`
              ),
          },
        ],
      }}
    >
      <div className={`h-[212px] ${LINE_GLOW}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="growthVisitors" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.cyan} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.cyan} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="growthConv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.line} strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={{ fill: C.dim, fontSize: 10 }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: C.lineBright }} />
            <Area
              type="monotone"
              dataKey="clicks"
              name="Visitors"
              stroke={C.cyan}
              strokeWidth={2.4}
              fill="url(#growthVisitors)"
              dot={false}
              activeDot={{ r: 4, fill: C.cyan, stroke: C.bg, strokeWidth: 2 }}
              isAnimationActive={!reduced}
              animationDuration={1300}
            />
            <Area
              type="monotone"
              dataKey="conversions"
              name="Conversions"
              stroke={C.gold}
              strokeWidth={2.4}
              fill="url(#growthConv)"
              dot={false}
              activeDot={{ r: 4, fill: C.gold, stroke: C.bg, strokeWidth: 2 }}
              isAnimationActive={!reduced}
              animationDuration={1300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex justify-center gap-5">
        {[
          ["Visitors", C.cyan],
          ["Conversions", C.gold],
        ].map(([label, color]) => (
          <li key={label} className="flex items-center gap-1.5 text-[11px]" style={{ color: C.muted }}>
            <span className="h-0.5 w-4 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            {label}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopProductsCard({ d, reduced }) {
  const navigate = useNavigate();
  const [rangeId, setRangeId] = useState("30");
  const range = rangeById(rangeId);
  const items = useMemo(() => topProducts(d.clickEvents, range.days, 5), [d.clickEvents, range.days]);
  const max = items[0]?.clicks || 1;
  const [grown, setGrown] = useState(reduced);
  useEffect(() => {
    if (reduced) return undefined;
    setGrown(false);
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [rangeId, reduced]);

  return (
    <Card
      title="Top Products by Clicks"
      subtitle={range.label}
      tall
      delay={400}
      menu={{
        ranges: RANGES,
        rangeId,
        onRange: setRangeId,
        actions: [
          { label: "See all links", icon: ArrowUpRight, onSelect: () => navigate("/links") },
          {
            label: "Ask Maya about this",
            icon: Sparkles,
            onSelect: () =>
              askMaya(
                items.length
                  ? `My top products by clicks (${range.label.toLowerCase()}) are ${items.map((p) => `${p.name} (${p.clicks})`).join(", ")}. Which one should I make my next TikTok ad for, and why?`
                  : "I haven't had any clicks yet. What's the quickest way to get my first ones?"
              ),
          },
        ],
      }}
    >
      {items.length === 0 ? (
        <div className="grid h-[212px] place-items-center text-center">
          <p className="text-[13px]" style={{ color: C.muted }}>
            No clicks in this range yet.
            <br />
            <span style={{ color: C.dim }}>Share a link and it will show up here.</span>
          </p>
        </div>
      ) : (
        <ol className="flex min-h-[212px] flex-col justify-center gap-3.5">
          {items.map((p, i) => (
            <li key={p.name} className="flex items-center gap-3">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                style={{
                  background: i === 0 ? `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})` : "rgba(30,76,134,0.7)",
                  color: i === 0 ? C.bg : C.text,
                  boxShadow: i === 0 ? "0 0 12px rgba(245,185,66,0.55)" : "none",
                }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] font-medium" style={{ color: C.text }} title={p.name}>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: i === 0 ? C.gold : C.muted }}>
                    {p.clicks}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(23,64,111,0.8)" }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
                    style={{
                      width: grown ? `${(p.clicks / max) * 100}%` : "0%",
                      transitionDelay: `${i * 90}ms`,
                      background: `linear-gradient(90deg, ${C.cyan}, ${i === 0 ? C.gold : C.teal})`,
                      boxShadow: "0 0 8px rgba(56,217,232,0.45)",
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function Greeting({ user, clickEvents }) {
  const now = new Date();
  const firstName = (user?.full_name || "").trim().split(/\s+/)[0];
  const today = now.toDateString();
  const clicksToday = clickEvents.filter((c) => new Date(c.clicked_at || c.created_at).toDateString() === today).length;

  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2 animate-in fade-in slide-in-from-top-2 duration-700 motion-reduce:animate-none">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight sm:text-[26px]" style={{ color: C.text }}>
          {greetingFor(now.getHours())}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-[13px]" style={{ color: C.muted }}>
          {clicksToday > 0
            ? `${clicksToday} click${clicksToday === 1 ? "" : "s"} on your links today. Nice!`
            : "No clicks yet today. A fresh post can change that."}
        </p>
      </div>
      <span
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
        style={{ borderColor: "rgba(95,214,154,0.4)", color: C.up, background: "rgba(95,214,154,0.08)" }}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none" style={{ background: C.up }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: C.up }} />
        </span>
        Live
      </span>
    </div>
  );
}

export default function PreviewDashboard() {
  const d = useOverviewData();
  const { user } = useAuth();
  const reduced = usePrefersReducedMotion();
  const steps = startHereSteps({ user, links: d.links });

  if (d.loading) {
    return (
      <div
        className="-mx-4 lg:-mx-6 -mt-4 lg:-mt-6 flex min-h-[calc(100vh-56px)] items-center justify-center"
        style={BG_GLOW}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-[3px]"
            style={{ borderColor: `${C.gold} transparent transparent transparent` }}
          />
          <p className="text-sm font-medium" style={{ color: C.muted }}>
            Loading your dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="-mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-6 pt-5 pb-10 min-h-[calc(100vh-56px)]"
      style={BG_GLOW}
    >
      <div className="mx-auto max-w-[1200px]">
        {d.links.length === 0 ? (
          // Charts of zeros tell a new user nothing about what to do. Until
          // their first link exists, the steps to get one are the dashboard.
          <StartHere steps={steps} />
        ) : (
        <>
        <Greeting user={user} clickEvents={d.clickEvents} />
        {!startHereComplete(steps) && <StartHere steps={steps} compact />}
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight" style={{ color: C.text }}>
          Performance
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <EarningsCard d={d} reduced={reduced} />
          <ConversionsCard d={d} reduced={reduced} />
          <TrafficCard d={d} reduced={reduced} />
          <EpcCard d={d} reduced={reduced} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.55fr_1fr]">
          <GrowthCard d={d} reduced={reduced} />
          <TopProductsCard d={d} reduced={reduced} />
        </div>
        </>
        )}

        <footer className="pt-6 pb-2 text-center">
          <p className="text-[11px]" style={{ color: C.dim }}>
            Affiliate Pro X · amhere4utoday.com
          </p>
          <p className="mt-1 text-[13px]" style={{ color: C.dim }}>
            Another development by{" "}
            <span className="movius-signature text-[19px] font-medium">Movius</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
