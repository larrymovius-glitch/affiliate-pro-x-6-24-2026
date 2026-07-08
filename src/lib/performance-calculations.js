export function moneyToCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

export function centsToMoney(cents) {
  return Number(((Number(cents) || 0) / 100).toFixed(2));
}

function eventDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function buildPerformanceChartData(clickEvents = [], conversionEvents = [], days = 30) {
  const rows = Array.from({ length: days }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (days - 1 - i));
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      clicks: 0,
      conversions: 0,
      earningsCents: 0,
      earnings: 0,
    };
  });

  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  clickEvents.forEach((click) => {
    const row = byKey[eventDay(click.clicked_at || click.created_date)];
    if (row) row.clicks += 1;
  });

  conversionEvents.forEach((conversion) => {
    const row = byKey[eventDay(conversion.converted_at || conversion.created_date)];
    if (row) {
      row.conversions += 1;
      row.earningsCents += moneyToCents(conversion.amount);
      row.earnings = centsToMoney(row.earningsCents);
    }
  });

  return rows.map(({ earningsCents, key, ...row }) => row);
}

export function uniqueClickSignals(clickEvents = []) {
  return new Set(clickEvents.map((click) => {
    const day = eventDay(click.clicked_at || click.created_date);
    return `${click.short_code || "unknown"}-${click.source || click.referrer || "direct"}-${day}`;
  })).size;
}

export function buildPerformanceMetrics({ links = [], clickEvents = [], conversionEvents = [] } = {}) {
  const linkClicks = links.reduce((sum, link) => sum + (Number(link.clicks) || 0), 0);
  const linkConversions = links.reduce((sum, link) => sum + (Number(link.conversions) || 0), 0);
  const linkEarningsCents = links.reduce((sum, link) => sum + moneyToCents(link.earnings), 0);

  const eventClicks = clickEvents.length;
  const eventConversions = conversionEvents.length;
  const eventEarningsCents = conversionEvents.reduce((sum, event) => sum + moneyToCents(event.amount), 0);

  const totalClicks = Math.max(linkClicks, eventClicks);
  const totalConversions = Math.max(linkConversions, eventConversions);
  const totalEarnings = centsToMoney(Math.max(linkEarningsCents, eventEarningsCents));
  const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : "0.0";

  return {
    totalClicks,
    totalConversions,
    totalEarnings,
    conversionRate,
    epc: totalClicks > 0 ? totalEarnings / totalClicks : 0,
    uniqueClicks: uniqueClickSignals(clickEvents),
    avgConversion: totalConversions > 0 ? totalEarnings / totalConversions : 0,
  };
}

export function calculatePayoutBalance(links = [], payouts = []) {
  const totalEarnedCents = links.reduce((sum, link) => sum + moneyToCents(link.earnings), 0);
  const paidCents = payouts
    .filter((payout) => payout.status === "paid")
    .reduce((sum, payout) => sum + moneyToCents(payout.amount), 0);
  const pendingCents = payouts
    .filter((payout) => payout.status === "pending" || payout.status === "approved")
    .reduce((sum, payout) => sum + moneyToCents(payout.amount), 0);
  const availableCents = Math.max(0, totalEarnedCents - paidCents - pendingCents);

  return {
    totalEarned: centsToMoney(totalEarnedCents),
    totalPaid: centsToMoney(paidCents),
    totalPending: centsToMoney(pendingCents),
    availableBalance: centsToMoney(availableCents),
  };
}