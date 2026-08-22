import { useState } from "react";
import { CardMenu, downloadCsv } from "./CardMenu";

const RANGE_LABEL = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };

const GLOSS =
  "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.32) 46%, rgba(255,255,255,0.02) 47%, rgba(255,255,255,0.10) 78%, rgba(255,255,255,0.28) 100%)";
const GLOSS_SILVER =
  GLOSS + ", linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.10) 100%)";
const METAL_UP = "linear-gradient(105deg, #2f9169 0%, #bdf5db 40%, #6fd0a2 58%, #3d8d68 100%)";
const METAL_DOWN = "linear-gradient(105deg, #b4231a 0%, #ff9d8f 40%, #e2352a 58%, #98150d 100%)";

const gloss = (hex) => `${GLOSS}, linear-gradient(180deg, ${hex} 0%, ${hex} 55%, rgba(0,0,0,0.32) 100%), ${hex}`;

/**
 * Reusable metric card: label + value + delta + sparkline, with a ⋮ menu for
 * range switching, compare, copy, export, and hide.
 *
 * values/deltas/spark are keyed by "today" / "7d" / "30d".
 */
export function MetricCard({ id, label, values, deltas, spark, accent = "#ffd60a", onHide, onToast }) {
  const [range, setRange] = useState("today");
  const [compare, setCompare] = useState(false);

  const value = values[range];
  const pct = deltas[range] ?? 0;
  const bars = spark[range] ?? [];
  const max = Math.max(...bars, 0.001);

  const copy = () => {
    navigator.clipboard?.writeText(value);
    onToast?.(`Copied ${value}`);
  };

  const actions = [
    { label: "Today", hint: range === "today" ? "✓" : "", onSelect: () => setRange("today") },
    { label: "Last 7 days", hint: range === "7d" ? "✓" : "", onSelect: () => setRange("7d") },
    { label: "Last 30 days", hint: range === "30d" ? "✓" : "", onSelect: () => setRange("30d") },
    {
      label: "Compare to previous",
      hint: compare ? "on" : "off",
      onSelect: () => setCompare((v) => !v),
    },
    { label: "Copy value", onSelect: copy },
    {
      label: "Export CSV",
      onSelect: () => {
        downloadCsv(`${id}-${range}.csv`, [
          ["metric", "range", "value"],
          [id, range, value],
        ]);
        onToast?.(`Exported ${id}-${range}.csv`);
      },
    },
    ...(onHide ? [{ label: "Hide card", onSelect: onHide }] : []),
  ];

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(160deg, #123f6e 0%, #0f3560 100%)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 14,
        padding: "18px 18px 16px",
        minHeight: 168,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#d3e4f6" }}>
          {label}
          {range !== "today" ? ` · ${RANGE_LABEL[range]}` : ""}
        </div>
        <CardMenu actions={actions} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 31, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            backgroundImage: pct >= 0 ? METAL_UP : METAL_DOWN,
          }}
        >
          {compare
            ? `${pct >= 0 ? "▲ " : "▼ "}${Math.abs(pct).toFixed(1)}% vs prev`
            : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", gap: 3, height: 34 }}>
        {bars.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: "3px 3px 1px 1px",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.35)",
              background: i === bars.length - 1 ? gloss(accent) : GLOSS_SILVER,
              height: `${Math.max(8, (v / max) * 100)}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
