import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { buildPerformanceChartData, buildPerformanceMetrics } from "@/lib/performance-calculations";
import { MoreVertical, TrendingUp, TrendingDown } from "lucide-react";
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
 * PreviewDashboard — blue/gold dashboard content, live at "/" inside the
 * app's normal AppLayout shell (Sidebar/TopBar/BottomNav) — same navigation,
 * "Ask Maya" chat, and Admin Panel access as every other page.
 *
 * Wired to real Supabase data via `useOverviewData` below (AffiliateLink,
 * ClickEvent, ConversionEvent), using the same calculations as the rest of
 * the app (`src/lib/performance-calculations.js`).
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

/* ------------------------------------------------------------------ */
/* Live data                                                           */
/* ------------------------------------------------------------------ */

function formatDelta(pct) {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function pctChange(curr, prev) {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  return curr > 0 ? 100 : 0;
}

const SOURCE_COLORS = [C.gold, C.cyan, C.teal, C.goldDeep];

function useOverviewData() {
  const linksQ = useQuery({ queryKey: ["links"], queryFn: () => base44.entities.AffiliateLink.list("-created_date", 200) });
  const clicksQ = useQuery({ queryKey: ["click-events"], queryFn: () => base44.entities.ClickEvent.list("-created_date", 1000) });
  const convQ = useQuery({ queryKey: ["conversion-events"], queryFn: () => base44.entities.ConversionEvent.list("-created_date", 1000) });

  const links = linksQ.data || [];
  const clickEvents = clicksQ.data || [];
  const conversionEvents = convQ.data || [];
  const loading = linksQ.isLoading || clicksQ.isLoading || convQ.isLoading;

  const metrics = buildPerformanceMetrics({ links, clickEvents, conversionEvents });
  const sixty = buildPerformanceChartData(clickEvents, conversionEvents, 60);
  const last12 = sixty.slice(-12);
  const thisWeek = sixty.slice(-7);
  const prevWeek = sixty.slice(-14, -7);

  const earningsThisWeek = thisWeek.reduce((s, r) => s + r.earnings, 0);
  const earningsLastWeek = prevWeek.reduce((s, r) => s + r.earnings, 0);
  const convThisWeek = thisWeek.reduce((s, r) => s + r.conversions, 0);
  const convLastWeek = prevWeek.reduce((s, r) => s + r.conversions, 0);

  const growth = buildPerformanceChartData(clickEvents, conversionEvents, 30).map((row, i) => ({
    day: i + 1,
    visitors: row.clicks,
    conversions: row.conversions,
  }));

  const sourceCounts = clickEvents.reduce((acc, click) => {
    const label = click.source || click.referrer || "Direct";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const totalSourceClicks = Object.values(sourceCounts).reduce((s, v) => s + v, 0);
  const sources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count], i) => ({
      name,
      value: totalSourceClicks > 0 ? Math.round((count / totalSourceClicks) * 100) : 0,
      fill: SOURCE_COLORS[i % SOURCE_COLORS.length],
    }));

  return {
    loading,
    earnings: {
      value: `$${metrics.totalEarnings.toFixed(2)}`,
      delta: formatDelta(pctChange(earningsThisWeek, earningsLastWeek)),
      series: last12.map((r, i) => ({ i, v: r.earnings })),
    },
    conversions: {
      value: metrics.totalConversions.toLocaleString(),
      delta: formatDelta(pctChange(convThisWeek, convLastWeek)),
      series: last12.map((r, i) => ({ i, v: r.conversions })),
    },
    traffic: {
      value: metrics.uniqueClicks.toLocaleString(),
      label: "Visitors",
      series: last12.map((r, i) => ({ i, v: r.clicks })),
    },
    // No fixed EPC target exists yet, so the gauge reads relative to a $2 EPC
    // ceiling — a reasonable placeholder scale until product defines a real one.
    epc: { value: `$${metrics.epc.toFixed(2)}`, pct: Math.min(metrics.epc / 2, 1) },
    growth,
    sources: sources.length > 0 ? sources : [{ name: "No traffic yet", value: 100, fill: C.lineBright }],
  };
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

function Card({ title, children, className = "", tall = false }) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-4 ${className}`}
      style={{
        borderColor: C.lineBright,
        background: `linear-gradient(160deg, ${C.cardTop} 0%, ${C.card} 100%)`,
        boxShadow: "0 12px 28px -18px rgba(0,0,0,0.8)",
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
              dot={{ r: 1.6, fill: C.gold, strokeWidth: 0 }}
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
            stroke={C.lineBright}
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
        <p className="-mt-3 text-[24px] font-bold tracking-tight" style={{ color: C.text }}>
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
          <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: C.dim, fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip {...tooltipStyle} labelFormatter={(d) => `Day ${d}`} cursor={{ stroke: C.lineBright }} />
            <Line
              type="monotone"
              dataKey="visitors"
              name="Visitors"
              stroke={C.cyan}
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="conversions"
              name="Conversions"
              stroke={C.gold}
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex justify-center gap-5">
        {[
          ["Visitors", C.cyan],
          ["Conversions", C.gold],
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

function renderOuterLabel({ cx, cy, midAngle, outerRadius, name, fill }) {
  const cos = Math.cos(-RADIAN * midAngle);
  const sin = Math.sin(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 4) * cos;
  const sy = cy + (outerRadius + 4) * sin;
  const mx = cx + (outerRadius + 16) * cos;
  const my = cy + (outerRadius + 16) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 12;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g key={name}>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={1} />
      <circle cx={sx} cy={sy} r={2} fill={fill} stroke="none" />
      <text
        x={ex + (cos >= 0 ? 4 : -4)}
        y={ey}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fill={C.muted}
        fontSize={11}
      >
        {name}
      </text>
    </g>
  );
}

function SourcesCard({ data }) {
  return (
    <Card title="Traffic Source Breakout" tall>
      <div className="h-[212px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={66}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
              label={renderOuterLabel}
              labelLine={false}
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
            <span className="h-2 w-2 rounded-full" style={{ background: s.fill }} />
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
  const d = useOverviewData();

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
