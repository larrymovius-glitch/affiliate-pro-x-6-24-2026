import React, { useEffect, useRef, useState } from "react";
import { COLORS, buildWavePath } from "./dash-theme";

function useCountUp(target, duration = 1400) {
  const [value, setValue] = useState(0);
  const rafRef = useRef();
  useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return value;
}

export default function EarningsHero({ totalEarnings = 0, percentChange = 0, chartData = [] }) {
  const animated = useCountUp(totalEarnings);
  const positive = percentChange >= 0;
  const { line, fill, end } = buildWavePath(chartData.map((r) => r.earnings || 0));

  return (
    <section
      className="relative overflow-hidden mb-4"
      style={{
        borderRadius: 20,
        background: `linear-gradient(160deg, ${COLORS.ocean700} 0%, ${COLORS.ocean800} 70%)`,
        border: "1px solid rgba(56,196,176,.18)",
        padding: "28px 28px 0",
      }}
      aria-label="Total earnings"
    >
      <div className="flex items-center gap-2 text-[13px]" style={{ color: COLORS.mist, letterSpacing: ".4px" }}>
        <span className="dot" style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.tide, boxShadow: `0 0 8px ${COLORS.tide}`, animation: "dashPulse 2.4s infinite" }} />
        TOTAL EARNINGS · LIVE
      </div>
      <div className="my-1.5 font-bold tabular-nums" style={{ fontFamily: COLORS.fontDisplay, fontSize: "clamp(40px, 8vw, 52px)", letterSpacing: "-1px", color: COLORS.foam }}>
        ${animated.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <span
        className="inline-flex items-center gap-1.5 mb-2"
        style={{ background: "rgba(56,196,176,.12)", color: COLORS.tide, fontSize: 13, fontWeight: 500, padding: "5px 12px", borderRadius: 20 }}
      >
        {positive ? "▲" : "▼"} {positive ? "+" : ""}{percentChange.toFixed(1)}% vs last week
      </span>
      <svg style={{ display: "block", width: "100%", height: 110, marginTop: -6 }} viewBox="0 0 1000 110" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.tide} stopOpacity=".35" />
            <stop offset="100%" stopColor={COLORS.tide} stopOpacity="0" />
          </linearGradient>
        </defs>
        {fill && <path d={fill} fill="url(#tideFill)" />}
        {line && <path d={line} fill="none" stroke={COLORS.tide} strokeWidth="2.5" strokeLinecap="round" />}
        {end && <circle cx={end[0]} cy={end[1]} r="5" fill={COLORS.tide} />}
      </svg>
    </section>
  );
}