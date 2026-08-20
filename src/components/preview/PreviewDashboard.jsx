import { useState } from "react";
import BrandEmblem from "@/components/preview/BrandEmblem";
import {
  LayoutGrid,
  Megaphone,
  Shuffle,
  Wallet,
  BarChart3,
  Wrench,
  Settings,
  ChevronsLeft,
  MoreVertical,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/**
 * PreviewDashboard — blue/gold mockup, PREVIEW ONLY.
 *
 * This is not wired to Supabase — every number here is placeholder data from
 * `useOverviewData` below. It exists so the blue/gold look can be judged
 * side-by-side with the live (violet/indigo) dashboard before any real
 * component gets restyled.
 *
 * Requires: recharts, lucide-react (both already in package.json).
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const C = {
  // Bright royal blue, per the reference mock — not near-black navy.
  bgGradient: "linear-gradient(150deg, #0C356F 0%, #10439A 42%, #0A2B66 100%)",
  panel: "#0A2A5F",
  card: "#0B2F68",
  cardTop: "#104084",
  line: "#1D4E9C",
  lineBright: "#2E63B8",
  goldBorder: "rgba(245,185,66,0.45)",
  gold: "#F5B942",
  goldSoft: "#FFD873",
  goldDeep: "#E09A2C",
  bronze: "#B47327",
  cyan: "#45DCEC",
  teal: "#2A9FC4",
  text: "#F2F7FF",
  muted: "#B7CFF0",
  dim: "#86A9DA",
  up: "#5FD69A",
};

/* ------------------------------------------------------------------ */
/* Placeholder data                                                    */
/* ------------------------------------------------------------------ */

function useOverviewData() {
  return {
    earnings: {
      value: "$4,895.12",
      delta: "+18%",
      series: [2.1, 3.4, 2.8, 4.2, 3.6, 5.1, 4.4, 6.2, 5.5, 7.1, 6.4, 8.2].map((v, i) => ({
        i,
        v,
      })),
    },
    conversions: {
      value: "342",
      delta: "+12%",
      series: [8, 10, 9, 11, 10, 12, 11, 14, 12, 15, 13, 16].map((v, i) => ({ i, v })),
    },
    traffic: {
      value: "21,560",
      label: "Visitors",
      series: [12, 18, 15, 24, 20, 29, 26, 34, 30, 41, 37, 46].map((v, i) => ({ i, v })),
    },
    epc: { value: "$0.85", pct: 0.68 },
    growth: Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      visitors: Math.round(150 + i * 24 + Math.sin(i / 2.2) * 70),
      conversions: Math.round(85 + i * 18 + Math.sin(i / 2.8) * 55),
    })),
    // Order matters: clockwise from 12 o'clock, so the callout labels land
    // where the reference mock puts them (Email right, Search bottom-right,
    // Social bottom-left, Payouts left/top-left).
    sources: [
      { name: "Email", value: 27, fill: "url(#segCyan)", dot: C.cyan },
      { name: "Search", value: 21, fill: "url(#segTeal)", dot: C.teal },
      { name: "Social", value: 14, fill: "url(#segBronze)", dot: C.bronze },
      { name: "Payouts", value: 38, fill: "url(#segGold)", dot: C.gold },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Backdrop — glow + sparkles, per the reference mock                  */
/* ------------------------------------------------------------------ */

const SPARKLES = [
  { top: "12%", left: "58%", size: 3, opacity: 0.9 },
  { top: "22%", left: "83%", size: 2, opacity: 0.7 },
  { top: "38%", left: "70%", size: 2, opacity: 0.5 },
  { top: "55%", left: "88%", size: 3, opacity: 0.8 },
  { top: "68%", left: "62%", size: 2, opacity: 0.6 },
  { top: "78%", left: "80%", size: 2, opacity: 0.75 },
  { top: "84%", left: "38%", size: 2, opacity: 0.5 },
  { top: "30%", left: "30%", size: 2, opacity: 0.45 },
];

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 600px at 78% 18%, rgba(69,156,255,0.28), transparent 65%)," +
            "radial-gradient(700px 500px at 15% 85%, rgba(38,99,196,0.35), transparent 70%)," +
            "radial-gradient(500px 340px at 90% 75%, rgba(245,185,66,0.10), transparent 70%)",
        }}
      />
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            background: "#EAF4FF",
            boxShadow: "0 0 6px 1px rgba(234,244,255,0.8)",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

const NAV = [
  { id: "overview", label: "Overview", Icon: LayoutGrid },
  { id: "campaigns", label: "Campaigns", Icon: Megaphone },
  { id: "traffic", label: "Traffic", Icon: Shuffle },
  { id: "payouts", label: "Payouts", Icon: Wallet },
  { id: "reports", label: "Reports", Icon: BarChart3 },
  { id: "tools", label: "Tools", Icon: Wrench },
];

function Rail({ active, onSelect }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t px-1 py-1.5 md:inset-y-0 md:right-auto md:left-0 md:w-[76px] md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:px-2 md:py-3"
      style={{ background: C.panel, borderColor: "rgba(245,185,66,0.25)" }}
    >
      <div className="hidden md:mb-3 md:block" aria-hidden="true">
        <BrandEmblem ringId="railEmblem" className="h-9 w-9" />
      </div>

      {NAV.map(({ id, label, Icon }) => {
        const on = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={on ? "page" : undefined}
            className="relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none"
            style={{
              background: on ? "rgba(245,185,66,0.16)" : "transparent",
              "--tw-ring-color": C.gold,
            }}
          >
            <Icon
              size={19}
              strokeWidth={on ? 2.2 : 1.8}
              style={{ color: on ? C.gold : C.goldDeep }}
            />
            <span
              className="text-[10px] font-medium leading-none"
              style={{ color: on ? C.text : C.muted }}
            >
              {label}
            </span>
          </button>
        );
      })}

      <div className="hidden md:mt-auto md:flex md:w-full md:items-center md:justify-between md:px-1.5">
        <button
          type="button"
          aria-label="Settings"
          className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[#17406F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B942] motion-reduce:transition-none"
          style={{ color: C.goldDeep }}
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          aria-label="Collapse navigation"
          className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[#17406F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B942] motion-reduce:transition-none"
          style={{ color: C.goldDeep }}
        >
          <ChevronsLeft size={16} />
        </button>
      </div>
    </nav>
  );
}

function TopBar() {
  return (
    <header className="mb-5 flex items-center gap-3">
      <div className="flex items-center gap-2.5">
        <BrandEmblem ringId="topbarEmblem" className="h-9 w-9 shrink-0 md:hidden" />
        <h1 className="text-[17px] font-semibold tracking-tight" style={{ color: C.text }}>
          Affiliate Pro X
        </h1>
      </div>

      <span
        className="ml-1 hidden rounded-full px-3 py-1 text-[11px] font-semibold text-[#07182E] sm:inline-block"
        style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})` }}
      >
        Velocity
      </span>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

function Card({ title, children, className = "", tall = false }) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-4 ${className}`}
      style={{
        // Reference mock: stat cards carry a visible gold edge; the two big
        // chart cards read slightly cooler.
        borderColor: tall ? "rgba(245,185,66,0.28)" : C.goldBorder,
        background: `linear-gradient(160deg, ${C.cardTop} 0%, ${C.card} 100%)`,
        boxShadow:
          "0 12px 28px -18px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2
          className={`font-medium ${tall ? "text-[14px]" : "text-[12px]"}`}
          style={{ color: tall ? C.text : C.muted }}
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label={`${title} options`}
          className="-mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-[#1E4C86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B942] motion-reduce:transition-none"
          style={{ color: C.dim }}
        >
          <MoreVertical size={14} />
        </button>
      </div>
      {children}
    </section>
  );
}

function Delta({ value }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: C.up }}>
      <TrendingUp size={12} strokeWidth={2.5} />
      {value}
    </span>
  );
}

function Figure({ value, delta, sub }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <p className="text-[26px] font-bold leading-none tracking-tight" style={{ color: C.text }}>
        {value}
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

function EarningsCard({ data }) {
  return (
    <Card title="Total Earnings">
      <Figure value={data.value} delta={data.delta} />
      <div className="h-11">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} stopOpacity={0.5} />
                <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={C.gold}
              strokeWidth={2}
              fill="url(#earnFill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ConversionsCard({ data }) {
  return (
    <Card title="Conversions">
      <Figure value={data.value} delta={data.delta} />
      <div className="h-11">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barGap={2}>
            <Bar dataKey="v" fill={C.gold} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TrafficCard({ data }) {
  return (
    <Card title="Traffic">
      <Figure value={data.value} sub={data.label} />
      <div className="h-11">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={C.gold}
              strokeWidth={2}
              dot={{ r: 1.8, fill: C.goldSoft, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** EPC gauge — SVG arc, no chart library needed. */
function EpcCard({ data }) {
  const R = 44;
  const CIRC = Math.PI * R; // half circle
  const filled = CIRC * Math.min(Math.max(data.pct, 0), 1);

  return (
    <Card title="EPC">
      <div className="flex flex-col items-center pt-1">
        <svg viewBox="0 0 110 62" className="h-[62px] w-[110px]" role="img" aria-label={`EPC ${data.value}`}>
          <defs>
            <linearGradient id="epcArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={C.goldDeep} />
              <stop offset="100%" stopColor={C.gold} />
            </linearGradient>
          </defs>
          <path
            d="M 11 55 A 44 44 0 0 1 99 55"
            fill="none"
            stroke="rgba(234,244,255,0.18)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M 11 55 A 44 44 0 0 1 99 55"
            fill="none"
            stroke="url(#epcArc)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRC}`}
          />
        </svg>
        <p className="-mt-5 text-[24px] font-bold tracking-tight" style={{ color: C.text }}>
          {data.value}
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
    background: "#081E3C",
    border: `1px solid ${C.lineBright}`,
    borderRadius: 10,
    fontSize: 12,
    padding: "6px 10px",
  },
  labelStyle: { color: C.muted, marginBottom: 2 },
  itemStyle: { color: C.text },
};

function GrowthCard({ data }) {
  return (
    <Card title="Campaign Growth — Last 30 Days" tall>
      <div className="h-[212px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 6, bottom: 10, left: 0 }}>
            <defs>
              <linearGradient id="growthVisitors" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.goldSoft} stopOpacity={0.28} />
                <stop offset="100%" stopColor={C.goldSoft} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="growthConversions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.goldDeep} stopOpacity={0.2} />
                <stop offset="100%" stopColor={C.goldDeep} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.line} strokeDasharray="3 5" vertical={false} />
            {/* Reference mock: no per-day tick labels along the bottom. */}
            <XAxis dataKey="day" hide />
            {/* Reference mock: exactly 0 / 500 / 1,000 on the y-axis. */}
            <YAxis
              domain={[0, 1000]}
              ticks={[0, 500, 1000]}
              tickFormatter={(v) => v.toLocaleString("en-US")}
              tick={{ fill: C.dim, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip {...tooltipStyle} labelFormatter={(d) => `Day ${d}`} cursor={{ stroke: C.lineBright }} />
            <Area
              type="monotone"
              dataKey="visitors"
              name="Visitors"
              stroke={C.goldSoft}
              strokeWidth={2.4}
              fill="url(#growthVisitors)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="conversions"
              name="Conversions"
              stroke={C.goldDeep}
              strokeWidth={2.4}
              fill="url(#growthConversions)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex justify-center gap-5">
        {[
          ["Visitors", C.goldSoft],
          ["Conversions", C.goldDeep],
        ].map(([label, color]) => (
          <li key={label} className="flex items-center gap-1.5 text-[11px]" style={{ color: C.muted }}>
            <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
            {label}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const RADIAN = Math.PI / 180;

function renderSourceLabel({ cx, cy, midAngle, outerRadius, name }) {
  const r = outerRadius + 16;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill={C.muted}
      fontSize={11}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {name}
    </text>
  );
}

function SourcesCard({ data }) {
  return (
    <Card title="Traffic Source Breakout" tall>
      <div className="h-[212px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <defs>
              <linearGradient id="segGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={C.goldSoft} />
                <stop offset="100%" stopColor={C.goldDeep} />
              </linearGradient>
              <linearGradient id="segBronze" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={C.goldDeep} />
                <stop offset="100%" stopColor="#8A5217" />
              </linearGradient>
              <linearGradient id="segCyan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7FE9F4" />
                <stop offset="100%" stopColor={C.cyan} />
              </linearGradient>
              <linearGradient id="segTeal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.cyan} />
                <stop offset="100%" stopColor="#1C7DA6" />
              </linearGradient>
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              startAngle={90}
              endAngle={-270}
              innerRadius="48%"
              outerRadius="74%"
              paddingAngle={1.5}
              stroke={C.card}
              strokeWidth={2}
              label={renderSourceLabel}
              labelLine={{ stroke: "rgba(183,207,240,0.55)", strokeWidth: 1 }}
              isAnimationActive={false}
            >
              {data.map((s) => (
                <Cell key={s.name} fill={s.fill} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v}%`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5 text-[11px]" style={{ color: C.muted }}>
            <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
            {s.name}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function PreviewDashboard() {
  const [section, setSection] = useState("overview");
  const d = useOverviewData();

  return (
    <div className="relative min-h-screen" style={{ background: C.bgGradient }}>
      <Backdrop />
      <Rail active={section} onSelect={setSection} />

      <main className="relative px-4 pb-24 pt-5 md:pb-8 md:pl-[92px] md:pr-6">
        <TopBar />

        <h2 className="mb-3 text-[15px] font-semibold tracking-tight" style={{ color: C.text }}>
          Today's Performance
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <EarningsCard data={d.earnings} />
          <ConversionsCard data={d.conversions} />
          <TrafficCard data={d.traffic} />
          <EpcCard data={d.epc} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.55fr_1fr]">
          <GrowthCard data={d.growth} />
          <SourcesCard data={d.sources} />
        </div>

        <footer className="pt-6 pb-2 text-center text-[11px]" style={{ color: C.dim }}>
          Affiliate Pro X · amhere4utoday.com
        </footer>
      </main>
    </div>
  );
}
