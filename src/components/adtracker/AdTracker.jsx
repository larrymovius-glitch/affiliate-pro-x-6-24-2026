"use client";

import { useMemo, useState } from "react";
import { downloadCsv, useToast } from "./CardMenu";

/* ---------- metallic palette ---------- */

const SHEEN =
  "linear-gradient(160deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0.18) 62%, rgba(255,255,255,0.22) 100%)";
const GLOSS =
  "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.32) 46%, rgba(255,255,255,0.02) 47%, rgba(255,255,255,0.10) 78%, rgba(255,255,255,0.28) 100%)";

const ramp = (dark, mid, hi) => `linear-gradient(105deg, ${dark} 0%, ${mid} 18%, ${hi} 42%, ${mid} 60%, ${dark} 100%)`;

const METAL_YELLOW = ramp("#6f4f03", "#ffd60a", "#fff6b0");
const METAL_RED = ramp("#5d0a05", "#e2352a", "#ffb3a8");
const METAL_UP = "linear-gradient(105deg, #2f9169 0%, #bdf5db 40%, #6fd0a2 58%, #3d8d68 100%)";
const METAL_DOWN = "linear-gradient(105deg, #b4231a 0%, #ff9d8f 40%, #e2352a 58%, #98150d 100%)";

/** Eight hues ~45° apart so no two creatives read as the same swatch. */
const THUMBS = [
  METAL_YELLOW,
  ramp("#123c60", "#4d9ce0", "#cfeaff"),
  METAL_RED,
  ramp("#0d4a2c", "#25b866", "#b6f7cf"),
  ramp("#2a2258", "#7c5cf0", "#ded3ff"),
  ramp("#0a4a4e", "#17c4c9", "#adfbfd"),
  ramp("#6b2a00", "#ff7a18", "#ffd0aa"),
  ramp("#5a0d3d", "#e6499a", "#ffc3e2"),
].map((g) => `${SHEEN}, ${g}`);

/** Stable per-creative swatch — hashed from the slug, so sorting never changes it. */
function thumbFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return THUMBS[h % THUMBS.length];
}

const MODERATION_DOT = { passed: METAL_UP, modified: METAL_YELLOW, flagged: METAL_RED };
const MODERATION_LABEL = { passed: "Passed moderation", modified: "Modified by moderation", flagged: "Flagged" };

/* ---------- helpers ---------- */

const num = (n) => n.toLocaleString("en-US");
/** Conversion rate, not CTR — this app doesn't track ad-platform impressions
 * for AI-generated organic posts, so clicks/impressions would always read
 * 0.00% and hide real winners. Clicks and conversions are both real fields
 * tracked on every post, so conversion rate is the honest "good vs bad" signal. */
const convRateOf = (a) => (a.clicks === 0 ? 0 : (a.conversions / a.clicks) * 100);

function ago(h) {
  if (h == null) return "—";
  if (h < 1) return "just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/* ---------- component ---------- */

/**
 * ads: {
 *   slug, name, channel, clicks, conversions, hoursSinceActive,
 *   moderationStatus?: "passed"|"modified"|"flagged",
 *   moderationNotes?, aiScore?: number, aiFeedback?,
 *   autopilotStatus?: "queued"|"running"|"weekly_winner"|"paused",
 *   trend?: { impressions, clicks }[],
 * }[]
 */
export function AdTracker({ ads, channels, staleHours = 48, linkFor, onRefresh }) {
  const [active, setActive] = useState([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("clicks");
  const [dir, setDir] = useState(-1);
  const [selected, setSelected] = useState([]);
  const [openSlug, setOpenSlug] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [utm, setUtm] = useState({
    base: typeof window !== "undefined" ? `${window.location.origin}/functions/trackClick?code=` : "",
    source: "facebook",
    medium: "social",
    campaign: "autopilot",
    content: "",
  });
  const { show, node: toastNode } = useToast();

  const channelList = channels ?? Array.from(new Set(ads.map((a) => a.channel)));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = ads.filter(
      (a) =>
        (active.length === 0 || active.includes(a.channel)) &&
        (q === "" || a.name.toLowerCase().includes(q) || a.slug.includes(q))
    );
    const key = {
      clicks: (a) => a.clicks,
      conversions: (a) => a.conversions,
      rate: convRateOf,
      last: (a) => -(a.hoursSinceActive ?? Infinity),
    };
    return [...filtered].sort((a, b) => (key[sort](a) - key[sort](b)) * dir);
  }, [ads, active, query, sort, dir]);

  const totalClicks = ads.reduce((n, a) => n + a.clicks, 0);
  const totalConversions = ads.reduce((n, a) => n + a.conversions, 0);
  const stale = ads.filter(
    (a) => (a.hoursSinceActive ?? 0) > staleHours && !dismissed.includes(a.slug)
  );
  const flagged = ads.filter((a) => a.moderationStatus === "flagged" && !dismissed.includes(`mod-${a.slug}`));
  const detail = ads.find((a) => a.slug === openSlug) ?? null;
  const compare = selected.map((s) => ads.find((a) => a.slug === s)).filter(Boolean);

  const builtUrl = `${utm.base}&utm_source=${utm.source}&utm_medium=${utm.medium}&utm_campaign=${utm.campaign}&utm_content=${utm.content}`;

  const grid = "34px minmax(0, 2.3fr) 1fr 1fr 1fr 0.8fr 1.1fr";
  const cell = { fontSize: 13, fontVariantNumeric: "tabular-nums", color: "#eaf2fb" };

  const sortBtn = (id, label) => (
    <button
      key={id}
      onClick={() => {
        if (sort === id) setDir((d) => (d === -1 ? 1 : -1));
        else {
          setSort(id);
          setDir(-1);
        }
      }}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        font: "inherit",
        fontSize: 11.5,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        textAlign: "left",
        cursor: "pointer",
        color: sort === id ? "#ffd60a" : "#86a9cd",
      }}
    >
      {label}
      {sort === id ? (dir === -1 ? " ↓" : " ↑") : ""}
    </button>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "28px 32px 64px",
        background: "linear-gradient(180deg, #0a2444 0%, #071a30 100%)",
        color: "#eaf2fb",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 5px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.015em" }}>
            Ad Tracker
          </h1>
          <div style={{ fontSize: 12.5, color: "#7d9dbf" }}>
            {rows.length} of {ads.length} AI-generated posts · real clicks and conversions
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setBuilderOpen((v) => !v)} style={yellowBtn}>
            Build tracking link
          </button>
          <button
            onClick={() => {
              onRefresh?.();
              show("Pulled the latest performance data");
            }}
            style={ghostBtn}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* totals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Clicks", value: num(totalClicks) },
          { label: "Conversions", value: num(totalConversions) },
          {
            label: "Avg conv. rate",
            value: `${totalClicks ? ((totalConversions / totalClicks) * 100).toFixed(2) : "0.00"}%`,
          },
          {
            label: "Last active",
            value: ads.length
              ? ago(Math.min(...ads.map((a) => a.hoursSinceActive ?? Infinity)))
              : "—",
          },
        ].map((t) => (
          <div key={t.label} style={panel}>
            <div style={capLabel}>{t.label}</div>
            <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* alerts: flagged first — a safety issue outranks a quiet creative */}
      {(flagged.length > 0 || stale.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {flagged.map((a) => (
            <div key={`mod-${a.slug}`} style={alertRow}>
              <span style={{ ...alertDot, background: METAL_RED }} />
              <div style={{ fontSize: 13, color: "#ffd9d4" }}>
                {a.name} — flagged by moderation
                {a.moderationNotes ? `: ${a.moderationNotes}` : ""}
              </div>
              <button onClick={() => setOpenSlug(a.slug)} style={{ ...linkBtn, marginLeft: "auto" }}>
                Inspect
              </button>
              <button onClick={() => setDismissed((d) => [...d, `mod-${a.slug}`])} style={linkBtn}>
                ×
              </button>
            </div>
          ))}
          {stale.map((a) => (
            <div key={a.slug} style={alertRow}>
              <span style={{ ...alertDot, background: METAL_RED }} />
              <div style={{ fontSize: 13, color: "#ffd9d4" }}>
                {a.name} — no activity in {ago(a.hoursSinceActive).replace(" ago", "")}
              </div>
              <button onClick={() => setOpenSlug(a.slug)} style={{ ...linkBtn, marginLeft: "auto" }}>
                Inspect
              </button>
              <button onClick={() => setDismissed((d) => [...d, a.slug])} style={linkBtn}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {[{ label: "All channels", value: null }, ...channelList.map((c) => ({ label: c, value: c }))].map((c) => {
          const on = c.value === null ? active.length === 0 : active.includes(c.value);
          return (
            <button
              key={c.label}
              onClick={() =>
                setActive((prev) =>
                  c.value === null ? [] : prev.includes(c.value) ? prev.filter((x) => x !== c.value) : [...prev, c.value]
                )
              }
              style={{
                border: `1px solid ${on ? "rgba(255,214,10,0.55)" : "rgba(255,255,255,0.14)"}`,
                background: on
                  ? "linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,214,10,0.30) 46%, rgba(255,214,10,0.08) 47%, rgba(255,214,10,0.16) 100%)"
                  : "rgba(255,255,255,0.04)",
                color: on ? "#ffe57a" : "#9dc0e4",
                font: "inherit",
                fontSize: 12.5,
                padding: "7px 13px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          );
        })}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creatives"
          style={{ ...input, marginLeft: "auto", width: 220 }}
        />
      </div>

      {/* table */}
      <div style={{ ...panel, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: grid,
            gap: 12,
            padding: "12px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            ...capLabel,
          }}
        >
          <div />
          <div>Creative</div>
          <div>Channel</div>
          {sortBtn("clicks", "Clicks")}
          {sortBtn("conversions", "Conversions")}
          {sortBtn("rate", "Conv. rate")}
          {sortBtn("last", "Last active")}
        </div>

        {rows.map((a) => {
          const on = selected.includes(a.slug);
          const modColor = a.moderationStatus ? MODERATION_DOT[a.moderationStatus] : null;
          return (
            <div
              key={a.slug}
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                gap: 12,
                alignItems: "center",
                padding: "13px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.055)",
                background: on ? "rgba(255,214,10,0.08)" : "transparent",
              }}
            >
              <button
                aria-label="Select for compare"
                onClick={() =>
                  setSelected((prev) => (prev.includes(a.slug) ? prev.filter((x) => x !== a.slug) : [...prev, a.slug].slice(-2)))
                }
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 5,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#08243f",
                  border: `1px solid ${on ? "rgba(255,214,10,0.7)" : "rgba(255,255,255,0.22)"}`,
                  background: on ? `${GLOSS}, ${METAL_YELLOW}` : "rgba(255,255,255,0.06)",
                }}
              >
                {on ? "✓" : ""}
              </button>

              <button
                onClick={() => setOpenSlug(a.slug)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  minWidth: 0,
                  color: "inherit",
                  font: "inherit",
                }}
              >
                <span style={{ position: "relative", flex: "none" }}>
                  <span
                    style={{
                      display: "block",
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.28), 0 1px 3px rgba(0,0,0,0.4)",
                      background: thumbFor(a.slug),
                    }}
                  />
                  {modColor && (
                    <span
                      title={MODERATION_LABEL[a.moderationStatus]}
                      style={{
                        position: "absolute",
                        top: -3,
                        right: -3,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        border: "2px solid #0f3560",
                        background: modColor,
                      }}
                    />
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, ...truncate }}>{a.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "#7d9dbf", ...truncate }}>{a.slug}</span>
                </span>
              </button>

              <div style={{ fontSize: 12.5, color: "#cfe1f4" }}>{a.channel}</div>
              <div style={cell}>{num(a.clicks)}</div>
              <div style={cell}>{num(a.conversions)}</div>
              <div
                style={{
                  ...cell,
                  fontWeight: 700,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  backgroundImage: convRateOf(a) >= 2 ? METAL_UP : METAL_DOWN,
                }}
              >
                {convRateOf(a).toFixed(2)}%
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: (a.hoursSinceActive ?? 0) > staleHours ? "#ff9d8f" : "#cfe1f4",
                }}
              >
                {ago(a.hoursSinceActive)}
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div style={{ padding: "46px 20px", textAlign: "center", fontSize: 13, color: "#7d9dbf" }}>
            No creatives match those filters.
          </div>
        )}
      </div>

      {/* head to head */}
      {compare.length === 2 && (
        <div style={{ ...panel, marginTop: 20, padding: "18px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Head to head</div>
            <button onClick={() => setSelected([])} style={linkBtn}>
              Clear selection
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {compare.map((a) => (
              <div
                key={a.slug}
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: "15px 16px",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.28)",
                      background: thumbFor(a.slug),
                    }}
                  />
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</div>
                </div>
                {[
                  ["Clicks", num(a.clicks)],
                  ["Conversions", num(a.conversions)],
                  ["Conv. rate", `${convRateOf(a).toFixed(2)}%`],
                  ["Last active", ago(a.hoursSinceActive)],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "7px 0",
                      borderTop: "1px solid rgba(255,255,255,0.07)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: "#9dc0e4" }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UTM builder */}
      {builderOpen && (
        <div style={{ ...panel, marginTop: 20, padding: "18px 20px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Tracking link builder</div>
          <div style={{ fontSize: 12, color: "#7d9dbf", marginBottom: 16 }}>
            Paste your post's real link into "Destination URL" below, then use the built link as
            wherever that post points people.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            {[
              ["base", "Destination URL"],
              ["source", "utm_source"],
              ["medium", "utm_medium"],
              ["campaign", "utm_campaign"],
              ["content", "utm_content"],
            ].map(([k, label]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={capLabel}>{label}</label>
                <input value={utm[k]} onChange={(e) => setUtm((p) => ({ ...p, [k]: e.target.value }))} style={input} />
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 15px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 12.5, fontFamily: "ui-monospace, Menlo, monospace", color: "#bfe2ff", wordBreak: "break-all" }}>
              {builtUrl}
            </div>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(builtUrl);
                show("Tracking link copied");
              }}
              style={{ ...yellowBtn, marginLeft: "auto", flex: "none" }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* detail drawer */}
      {detail && (
        <>
          <div onClick={() => setOpenSlug(null)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(3,12,24,0.55)" }} />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 55,
              width: 430,
              maxWidth: "92vw",
              padding: "24px 26px",
              overflowY: "auto",
              background: "linear-gradient(180deg, #10375f 0%, #0a2646 100%)",
              borderLeft: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "-24px 0 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 9,
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.28)",
                    background: thumbFor(detail.slug),
                  }}
                />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{detail.name}</div>
                  <div style={{ fontSize: 12, color: "#7d9dbf" }}>{detail.channel}</div>
                </div>
              </div>
              <button onClick={() => setOpenSlug(null)} style={linkBtn}>
                ×
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
              {[
                ["Clicks", num(detail.clicks)],
                ["Conversions", num(detail.conversions)],
                ["Conv. rate", `${convRateOf(detail).toFixed(2)}%`],
              ].map(([k, v]) => (
                <div key={k} style={statBox}>
                  <div style={{ ...capLabel, marginBottom: 5 }}>{k}</div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Visibility into the 3 layers before this ever posted */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {detail.aiScore != null && (
                <div style={statBox}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: detail.aiFeedback ? 6 : 0 }}>
                    <span style={capLabel}>AI quality score</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: detail.aiScore >= 6 ? "#6fd0a2" : "#ff9d8f" }}>
                      {detail.aiScore}/10
                    </span>
                  </div>
                  {detail.aiFeedback && <div style={{ fontSize: 12.5, color: "#cfe1f4" }}>{detail.aiFeedback}</div>}
                </div>
              )}

              {detail.moderationStatus && (
                <div style={statBox}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: detail.moderationNotes ? 6 : 0 }}>
                    <span style={capLabel}>Moderation</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "3px 8px",
                        borderRadius: 999,
                        color: detail.moderationStatus === "flagged" ? "#ffd9d4" : "#08243f",
                        background: detail.moderationStatus === "flagged" ? "rgba(226,53,42,0.18)" : `${GLOSS}, ${MODERATION_DOT[detail.moderationStatus]}`,
                      }}
                    >
                      {detail.moderationStatus}
                    </span>
                  </div>
                  {detail.moderationNotes && <div style={{ fontSize: 12.5, color: "#cfe1f4" }}>{detail.moderationNotes}</div>}
                </div>
              )}

              {detail.autopilotStatus && (
                <div style={{ ...statBox, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={capLabel}>Autopilot</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{detail.autopilotStatus.replace("_", " ")}</span>
                </div>
              )}
            </div>

            {detail.linkUrl && (
              <div style={{ padding: "14px 15px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
                <div style={{ ...capLabel, marginBottom: 8 }}>Tracking link</div>
                <div style={{ fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace", color: "#bfe2ff", wordBreak: "break-all", marginBottom: 12 }}>
                  {detail.linkUrl}
                </div>
                <div style={{ display: "flex", gap: 9 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(detail.linkUrl);
                      show("Link copied");
                    }}
                    style={yellowBtn}
                  >
                    Copy link
                  </button>
                  <button
                    onClick={() =>
                      downloadCsv(`${detail.slug}.csv`, [
                        ["metric", "value"],
                        ["clicks", detail.clicks],
                        ["conversions", detail.conversions],
                        ["conv_rate_pct", convRateOf(detail).toFixed(2)],
                      ])
                    }
                    style={ghostBtn}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {toastNode}
    </div>
  );
}

/* ---------- shared inline styles ---------- */

const panel = {
  background: "linear-gradient(160deg, #123f6e 0%, #0f3560 100%)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
  padding: "15px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const statBox = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "11px 12px",
  background: "rgba(255,255,255,0.04)",
};

const alertRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 15px",
  borderRadius: 11,
  border: "1px solid rgba(226,53,42,0.4)",
  background: "linear-gradient(100deg, rgba(226,53,42,0.18) 0%, rgba(226,53,42,0.06) 60%)",
};

const alertDot = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
  flex: "none",
};

const capLabel = {
  fontSize: 11.5,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "#86a9cd",
};

const truncate = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const input = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "#eaf2fb",
  font: "inherit",
  fontSize: 13,
  padding: "9px 11px",
  borderRadius: 9,
  outline: "none",
};

const yellowBtn = {
  border: "1px solid rgba(255,214,10,0.5)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,214,10,0.32) 46%, rgba(255,214,10,0.08) 47%, rgba(255,214,10,0.18) 100%)",
  color: "#ffe57a",
  font: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  padding: "9px 15px",
  borderRadius: 9,
  cursor: "pointer",
};

const ghostBtn = {
  border: "1px solid rgba(255,255,255,0.16)",
  background: "transparent",
  color: "#9dc0e4",
  font: "inherit",
  fontSize: 12.5,
  padding: "9px 14px",
  borderRadius: 9,
  cursor: "pointer",
};

const linkBtn = {
  border: "none",
  background: "transparent",
  color: "#8fb3d9",
  font: "inherit",
  fontSize: 12.5,
  cursor: "pointer",
  padding: "2px 4px",
};
