// The Tax Year Income Report on the Payouts page. Most members never think
// about taxes until a 1099 arrives, so this keeps a running record of money
// actually received, by year, in a shape a tax preparer can use.
//
// What counts as income here is money that arrived: payments the member typed
// in from each network's statement, plus APX payouts marked paid. Sales the
// networks reported to APX (conversion_events) are shown for reference only
// and never added to the total -- the same commission would otherwise be
// counted twice, once when reported and again when the network paid it.

export const INCOME_SOURCES = ["ClickBank", "Digistore24", "eBay Partner Network", "Impact", "Shopify", "Other"];

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Stored dates are either "YYYY-MM-DD" (received_on) or an ISO timestamp; the
// first ten characters are the date either way, and slicing avoids a time
// zone shifting a Dec 31 payment into the next tax year.
const dayOf = (value) => (typeof value === "string" ? value.slice(0, 10) : "");
const yearOf = (value) => Number(dayOf(value).slice(0, 4)) || null;

function payoutDate(payout) {
  return payout.paid_at || payout.processed_at || "";
}

/** Years with any record, plus the current one, newest first. */
export function yearsAvailable({ entries = [], payouts = [], conversions = [] }, now = new Date()) {
  const years = new Set([now.getFullYear()]);
  for (const e of entries) if (yearOf(e.received_on)) years.add(yearOf(e.received_on));
  for (const p of payouts) if (p.status === "paid" && yearOf(payoutDate(p))) years.add(yearOf(payoutDate(p)));
  for (const c of conversions) if (yearOf(c.converted_at)) years.add(yearOf(c.converted_at));
  return [...years].sort((a, b) => b - a);
}

/**
 * @param {{ entries?: any[], payouts?: any[], conversions?: any[], year: number }} input
 */
export function buildTaxYearReport({ entries = [], payouts = [], conversions = [], year }) {
  const received = [
    ...entries
      .filter((e) => yearOf(e.received_on) === year)
      .map((e) => ({
        id: e.id,
        date: dayOf(e.received_on),
        source: e.source || "Other",
        type: "Payment received",
        amount: cents(e.amount),
        note: e.note || "",
        editable: true,
      })),
    ...payouts
      .filter((p) => p.status === "paid" && yearOf(payoutDate(p)) === year)
      .map((p) => ({
        id: p.id,
        date: dayOf(payoutDate(p)),
        source: "Affiliate Pro X",
        type: "APX payout",
        amount: cents(p.amount),
        note: p.notes || "",
        editable: false,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const bySourceMap = new Map();
  const byMonth = Array(12).fill(0);
  for (const row of received) {
    bySourceMap.set(row.source, cents((bySourceMap.get(row.source) || 0) + row.amount));
    const month = Number(row.date.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) byMonth[month] = cents(byMonth[month] + row.amount);
  }

  const reportedMap = new Map();
  for (const c of conversions) {
    if (yearOf(c.converted_at) !== year) continue;
    const network = c.network || "Unknown";
    const prev = reportedMap.get(network) || { network, total: 0, count: 0 };
    reportedMap.set(network, { network, total: cents(prev.total + (Number(c.commission) || 0)), count: prev.count + 1 });
  }
  const reportedByNetwork = [...reportedMap.values()].sort((a, b) => b.total - a.total);

  return {
    year,
    received,
    totalReceived: cents(received.reduce((sum, r) => sum + r.amount, 0)),
    bySource: [...bySourceMap.entries()].map(([source, total]) => ({ source, total })).sort((a, b) => b.total - a.total),
    byMonth,
    reportedByNetwork,
    reportedTotal: cents(reportedByNetwork.reduce((sum, r) => sum + r.total, 0)),
  };
}

// A spreadsheet opens a cell starting with = + - @ as a formula, and a note is
// free text the member typed, so those cells are prefixed to stay plain text.
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The download a member hands to a tax preparer. */
export function taxReportCsv(report) {
  const lines = [
    [`Affiliate Pro X income record, tax year ${report.year}`],
    ["Not tax advice. Compare with the tax forms (such as 1099s) each network sends you."],
    [],
    ["Date", "Source", "Type", "Amount (USD)", "Note"],
    ...report.received.map((r) => [r.date, r.source, r.type, r.amount.toFixed(2), r.note]),
    [],
    ["Total received", "", "", report.totalReceived.toFixed(2), ""],
    [],
    ["Totals by source"],
    ...report.bySource.map((s) => [s.source, "", "", s.total.toFixed(2), ""]),
  ];
  if (report.reportedByNetwork.length) {
    lines.push(
      [],
      ["Sales networks reported to APX (reference only, not added to the total)"],
      ...report.reportedByNetwork.map((n) => [n.network, `${n.count} sale(s)`, "", n.total.toFixed(2), ""])
    );
  }
  return lines.map((cols) => cols.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
