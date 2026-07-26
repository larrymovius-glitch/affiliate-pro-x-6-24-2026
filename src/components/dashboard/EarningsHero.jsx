import React, { useEffect, useRef, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { COLORS } from "./dash-theme";

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const rafRef = useRef();
  useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return value;
}

export default function EarningsHero({ totalEarnings = 0, percentChange = 0, chartData = [] }) {
  const animated = useCountUp(totalEarnings);
  const positive = percentChange >= 0;

  return (
    <section
      className="rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
      style={{ background: "linear-gradient(160deg, #103049 0%, #0B1B2B 100%)", border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide" style={{ color: COLORS.muted }}>
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 rounded-full opacity-60 animate-ping" style={{ background: COLORS.teal }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: COLORS.teal }} />
          </span>
          LIVE
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold"
          style={{
            background: positive ? "rgba(46,204,113,0.18)" : "rgba(239,68,68,0.18)",
            color: positive ? "#5BE08A" : "#FF8B8B",
          }}
        >
          {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {positive ? "+" : ""}{percentChange.toFixed(1)}%
        </span>
      </div>

      <p className="mt-5 text-sm" style={{ color: COLORS.muted }}>Total Earnings</p>
      <h2 className="mt-1 font-display text-5xl md:text-6xl font-black tabular-nums" style={{ color: COLORS.text }}>
        ${animated.toFixed(2)}
      </h2>
      <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>vs last week</p>

      <div className="mt-4 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tealArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.teal} stopOpacity={0.5} />
                <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="earnings" stroke={COLORS.teal} strokeWidth={2.5} fill="url(#tealArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}