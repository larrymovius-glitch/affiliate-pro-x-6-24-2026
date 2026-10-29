import { buildPerformanceMetrics, centsToMoney, moneyToCents, uniqueClickSignals } from "./performance-calculations.js";

// Time ranges a dashboard card can be switched to from its "⋮" menu.
export const RANGES = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

export function rangeById(id) {
  return RANGES.find((r) => r.id === id) || RANGES[RANGES.length - 1];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function eventTime(event, field) {
  const t = new Date(event[field] || event.created_at).getTime();
  return Number.isNaN(t) ? null : t;
}

// Events whose time falls in [now - (offset + days), now - offset) days.
export function eventsInWindow(events = [], field, days, now = Date.now(), offsetDays = 0) {
  const end = now - offsetDays * DAY_MS;
  const start = end - days * DAY_MS;
  return events.filter((e) => {
    const t = eventTime(e, field);
    return t !== null && t >= start && t < end;
  });
}

function totals(clickEvents, conversionEvents) {
  const earningsCents = conversionEvents.reduce((s, e) => s + moneyToCents(e.amount), 0);
  const earnings = centsToMoney(earningsCents);
  const clicks = clickEvents.length;
  return {
    earnings,
    conversions: conversionEvents.length,
    clicks,
    visitors: uniqueClickSignals(clickEvents),
    epc: clicks > 0 ? earnings / clicks : 0,
  };
}

export function pctChange(curr, prev) {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  return curr > 0 ? 100 : 0;
}

/**
 * Card numbers for one range. A dated range compares itself with the same
 * length of time just before it; "All time" keeps the app-wide totals and
 * compares this week with last week, as the dashboard always has.
 */
export function rangeSummary({ links = [], clickEvents = [], conversionEvents = [], days = null, now = Date.now() } = {}) {
  const span = days || 7;
  const recentClicks = eventsInWindow(clickEvents, "clicked_at", span, now);
  const recentConv = eventsInWindow(conversionEvents, "converted_at", span, now);
  const prevClicks = eventsInWindow(clickEvents, "clicked_at", span, now, span);
  const prevConv = eventsInWindow(conversionEvents, "converted_at", span, now, span);
  const recent = totals(recentClicks, recentConv);
  const prev = totals(prevClicks, prevConv);

  const current = days
    ? recent
    : (() => {
        const m = buildPerformanceMetrics({ links, clickEvents, conversionEvents });
        return {
          earnings: m.totalEarnings,
          conversions: m.totalConversions,
          clicks: m.totalClicks,
          visitors: m.uniqueClicks,
          epc: m.epc,
        };
      })();

  return {
    ...current,
    earningsDelta: pctChange(recent.earnings, prev.earnings),
    conversionsDelta: pctChange(recent.conversions, prev.conversions),
    visitorsDelta: pctChange(recent.visitors, prev.visitors),
  };
}

/** The most-clicked products, for the "Top Products" card. */
export function topProducts(clickEvents = [], days = null, limit = 5, now = Date.now()) {
  const events = days ? eventsInWindow(clickEvents, "clicked_at", days, now) : clickEvents;
  const counts = {};
  for (const e of events) {
    const name = (e.product_name || e.short_code || "Unknown").trim();
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, clicks]) => ({ name, clicks }));
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows = [], columns = []) {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(","));
  return [head, ...body].join("\n");
}

export function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
