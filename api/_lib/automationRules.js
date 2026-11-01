// Pure logic for the Pro automation rules, kept apart from the cron handler
// (api/runAutomationRules.js) so the decisions can be tested without a database.
//
// Only "send_alert" is carried out automatically. The other actions change a
// member's live links, and how to do that safely is not decided yet, so a match
// on them escalates to the member instead of guessing (three-branch rule,
// docs/policies-and-procedures.md section 1).

export const AUTOMATIC_ACTIONS = new Set(["send_alert"]);

const ACTION_LABELS = {
  promote_winner: "promote the winning ad",
  pause_loser: "pause the weak ad",
  create_variants: "create new variants",
  send_alert: "send an alert",
};

const METRIC_LABELS = {
  epc: "EPC",
  conversion_rate: "conversion rate",
  clicks: "clicks",
  earnings: "earnings",
};

// A rule fires at most once per window so a link that stays over its threshold
// doesn't send the same alert every day. Slightly under 24h so a daily cron
// that runs a few minutes early still fires.
export const REFIRE_WINDOW_MS = 20 * 60 * 60 * 1000;

// Rates are undefined with no clicks. Returning null (not 0) keeps a brand-new
// link from matching a "conversion rate at or below X" rule on day one.
export function metricFor(link, metric) {
  const clicks = Number(link.clicks) || 0;
  const conversions = Number(link.conversions) || 0;
  const earnings = Number(link.earnings) || 0;
  switch (metric) {
    case "clicks": return clicks;
    case "earnings": return earnings;
    case "epc": return clicks > 0 ? earnings / clicks : null;
    case "conversion_rate": return clicks > 0 ? (conversions / clicks) * 100 : null;
    default: return null;
  }
}

export function compare(value, operator, threshold) {
  if (value === null || !Number.isFinite(value)) return false;
  const t = Number(threshold);
  if (!Number.isFinite(t)) return false;
  if (operator === "lte") return value <= t;
  if (operator === "gte" || !operator) return value >= t;
  return false;
}

export function isDue(rule, now = Date.now()) {
  if (!rule.is_active) return false;
  if (!rule.last_triggered_at) return true;
  return now - new Date(rule.last_triggered_at).getTime() >= REFIRE_WINDOW_MS;
}

export function matchingLinks(rule, links) {
  return links
    .filter((link) => link.is_active !== false && link.created_by_id === rule.created_by_id)
    .map((link) => ({ link, value: metricFor(link, rule.trigger_metric) }))
    .filter(({ value }) => compare(value, rule.trigger_operator, rule.threshold));
}

function formatValue(metric, value) {
  if (metric === "earnings" || metric === "epc") return `$${value.toFixed(2)}`;
  if (metric === "conversion_rate") return `${value.toFixed(1)}%`;
  return String(Math.round(value));
}

// notifications.type is limited by a database check constraint to a fixed set
// (payout_completed, post_published, milestone, veteran_status, general), so
// both outcomes use "general"; the title says which kind it is.
export function buildNotification(rule, matches) {
  const metric = METRIC_LABELS[rule.trigger_metric] || rule.trigger_metric;
  const shown = matches.slice(0, 5).map(({ link, value }) =>
    `${link.product_name || link.short_code || "A link"}: ${formatValue(rule.trigger_metric, value)} ${metric}`);
  const more = matches.length > shown.length ? ` (+${matches.length - shown.length} more)` : "";
  const list = shown.join("; ") + more;

  if (AUTOMATIC_ACTIONS.has(rule.action)) {
    return {
      user_id: rule.created_by_id,
      type: "general",
      title: `Rule "${rule.name}" matched ${matches.length} link${matches.length === 1 ? "" : "s"}`,
      body: list,
      link_to: "/links",
      read: false,
    };
  }
  const action = ACTION_LABELS[rule.action] || rule.action;
  return {
    user_id: rule.created_by_id,
    type: "general",
    title: `Rule "${rule.name}" needs your OK`,
    body: `It matched: ${list}. APX does not ${action} on its own yet. Review these links and decide.`,
    link_to: "/links",
    read: false,
  };
}
