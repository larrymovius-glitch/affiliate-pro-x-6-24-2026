import React from "react";
import { COLORS } from "./dash-theme";

const TONE = {
  teal: COLORS.teal,
  sand: COLORS.sand,
  muted: COLORS.muted,
  red: "#FF8B8B",
};

export default function StatCardsRow({ cards = [] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        const tone = TONE[c.tone] || COLORS.muted;
        return (
          <div
            key={i}
            className="rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: COLORS.tealDim }}>
                <Icon className="h-4 w-4" style={{ color: COLORS.teal }} />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.muted }}>{c.label}</span>
            </div>
            <p className="mt-3 font-display text-2xl md:text-3xl font-extrabold tabular-nums" style={{ color: COLORS.text }}>{c.value}</p>
            <p className="mt-1 text-xs" style={{ color: tone }}>{c.sublabel}</p>
          </div>
        );
      })}
    </div>
  );
}