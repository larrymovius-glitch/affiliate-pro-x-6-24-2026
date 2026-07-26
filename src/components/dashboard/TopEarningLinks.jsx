import React from "react";
import { Link2 } from "lucide-react";
import { COLORS } from "./dash-theme";

export default function TopEarningLinks({ links = [] }) {
  const top = [...links].sort((a, b) => (b.earnings || 0) - (a.earnings || 0)).slice(0, 5);
  const max = Math.max(...top.map((l) => l.earnings || 0), 0.01);

  return (
    <div
      className="rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <h3 className="font-display text-base font-bold" style={{ color: COLORS.text }}>Top earning links</h3>
      <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>Your best performers this period</p>
      <div className="mt-5 space-y-4">
        {top.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: COLORS.muted }}>No links yet — create one to start earning.</p>
        ) : top.map((l) => {
          const pct = Math.max(4, ((l.earnings || 0) / max) * 100);
          return (
            <div key={l.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Link2 className="h-4 w-4 shrink-0" style={{ color: COLORS.teal }} />
                  <span className="truncate text-sm font-medium" style={{ color: COLORS.text }}>{l.product_name || "Untitled link"}</span>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: COLORS.teal }}>${(l.earnings || 0).toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS.teal }} />
                </div>
                <span className="text-xs tabular-nums shrink-0" style={{ color: COLORS.muted }}>{(l.clicks || 0).toLocaleString()} clicks</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}