import React from "react";
import { COLORS } from "./dash-theme";

const TONE = {
  up: COLORS.tide,
  down: COLORS.coral,
  warm: COLORS.sand,
  faint: COLORS.faint,
};

export default function StatCardsRow({ cards = [] }) {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4" aria-label="Key stats">
      {cards.map((c, i) => {
        const Icon = c.icon;
        const tone = TONE[c.tone] || COLORS.faint;
        return (
          <div
            key={i}
            className="transition-transform"
            style={{
              background: COLORS.ocean800,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: COLORS.radius,
              padding: "18px 20px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(56,196,176,.35)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.cardBorder; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <div className="flex items-center gap-2 mb-2" style={{ fontSize: "12.5px", color: COLORS.mist }}>
              <Icon style={{ width: 15, height: 15, color: COLORS.faint }} />
              {c.label}
            </div>
            <div className="font-semibold tabular-nums" style={{ fontFamily: COLORS.fontDisplay, fontSize: 26, color: COLORS.foam }}>
              {c.value}
            </div>
            <div className="mt-1" style={{ fontSize: 12, color: tone }}>{c.sublabel}</div>
          </div>
        );
      })}
    </section>
  );
}