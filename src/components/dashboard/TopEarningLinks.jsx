import React from "react";
import { COLORS } from "./dash-theme";

export default function TopEarningLinks({ links = [], rangeLabel = "Last 7 days" }) {
  const top = [...links].sort((a, b) => (b.earnings || 0) - (a.earnings || 0)).slice(0, 5);
  const max = Math.max(...top.map((l) => l.earnings || 0), 0.01);

  return (
    <div className="card" style={{ background: COLORS.ocean800, border: `1px solid ${COLORS.cardBorder}`, borderRadius: COLORS.radius, padding: "20px 22px" }}>
      <h3 className="flex items-center justify-between mb-3.5" style={{ fontFamily: COLORS.fontDisplay, fontSize: 14, fontWeight: 600, color: COLORS.foam }}>
        Top earning links
        <span style={{ fontSize: "11.5px", color: COLORS.faint, fontWeight: 400, fontFamily: "'Inter', sans-serif" }}>{rangeLabel}</span>
      </h3>
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "13.5px" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", color: COLORS.faint, fontWeight: 500, fontSize: "11.5px", letterSpacing: ".5px", textTransform: "uppercase", paddingBottom: 10 }}>Link</th>
            <th style={{ textAlign: "left", color: COLORS.faint, fontWeight: 500, fontSize: "11.5px", letterSpacing: ".5px", textTransform: "uppercase", paddingBottom: 10 }}>Clicks</th>
            <th style={{ textAlign: "right", color: COLORS.faint, fontWeight: 500, fontSize: "11.5px", letterSpacing: ".5px", textTransform: "uppercase", paddingBottom: 10 }}>Earned</th>
          </tr>
        </thead>
        <tbody>
          {top.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-8 text-center" style={{ color: COLORS.faint, fontSize: 13 }}>No links yet — create one to start earning.</td>
            </tr>
          ) : top.map((l) => {
            const pct = Math.max(6, ((l.earnings || 0) / max) * 100);
            const initial = (l.product_name || "L").trim().charAt(0).toUpperCase();
            return (
              <tr key={l.id}>
                <td style={{ padding: "10px 0", borderTop: `1px solid ${COLORS.rowBorder}` }}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: COLORS.ocean600, fontSize: 13, color: COLORS.mist }}>{initial}</span>
                    <div className="min-w-0">
                      <div className="truncate" style={{ color: COLORS.foam, maxWidth: 180 }}>{l.product_name || "Untitled link"}</div>
                      <div style={{ height: 5, borderRadius: 3, background: COLORS.ocean600, overflow: "hidden", marginTop: 6, width: 90 }}>
                        <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: `linear-gradient(90deg, ${COLORS.tideDeep}, ${COLORS.tide})` }} />
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "10px 0", borderTop: `1px solid ${COLORS.rowBorder}`, fontVariantNumeric: "tabular-nums", color: COLORS.foam }}>{(l.clicks || 0).toLocaleString()}</td>
                <td style={{ padding: "10px 0", borderTop: `1px solid ${COLORS.rowBorder}`, textAlign: "right", fontVariantNumeric: "tabular-nums", color: COLORS.tide, fontWeight: 500 }}>${(l.earnings || 0).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}