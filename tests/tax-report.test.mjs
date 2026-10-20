import assert from "node:assert/strict";
import test from "node:test";
import { buildTaxYearReport, taxReportCsv, yearsAvailable } from "../src/lib/taxReport.js";

// A member hands this to a tax preparer, so the totals have to be exactly the
// money that arrived in that year: nothing counted twice, nothing slipping
// into the wrong year.

const entries = [
  { id: "e1", received_on: "2026-03-05", source: "ClickBank", amount: 120.5, note: "March check" },
  { id: "e2", received_on: "2026-12-31", source: "Digistore24", amount: 80 },
  { id: "e3", received_on: "2025-11-02", source: "ClickBank", amount: 40 },
];
const payouts = [
  { id: "p1", status: "paid", paid_at: "2026-06-10T15:00:00Z", amount: 25 },
  { id: "p2", status: "pending", requested_at: "2026-07-01T00:00:00Z", amount: 999 },
];
const conversions = [
  { network: "clickbank", commission: 60.25, converted_at: "2026-03-01T10:00:00Z" },
  { network: "clickbank", commission: 60.25, converted_at: "2026-03-02T10:00:00Z" },
];

test("the total is payments received plus paid APX payouts, for that year only", () => {
  const r = buildTaxYearReport({ entries, payouts, conversions, year: 2026 });
  assert.equal(r.totalReceived, 225.5);
  assert.deepEqual(r.received.map((x) => x.id), ["e1", "p1", "e2"], "sorted by date");
  assert.equal(buildTaxYearReport({ entries, payouts, conversions, year: 2025 }).totalReceived, 40);
});

test("a pending payout is not income yet", () => {
  const r = buildTaxYearReport({ entries: [], payouts, conversions: [], year: 2026 });
  assert.equal(r.totalReceived, 25);
});

test("network-reported sales are reference only, never added to the total", () => {
  const r = buildTaxYearReport({ entries, payouts, conversions, year: 2026 });
  assert.equal(r.reportedTotal, 120.5);
  assert.deepEqual(r.reportedByNetwork, [{ network: "clickbank", total: 120.5, count: 2 }]);
  assert.equal(r.totalReceived, 225.5, "the same commission is not counted twice");
});

test("a Dec 31 payment stays in its own year", () => {
  const r = buildTaxYearReport({ entries, payouts: [], conversions: [], year: 2026 });
  assert.equal(r.byMonth[11], 80);
  assert.equal(r.byMonth[2], 120.5);
});

test("totals by source add up", () => {
  const r = buildTaxYearReport({ entries, payouts, conversions, year: 2026 });
  assert.deepEqual(r.bySource, [
    { source: "ClickBank", total: 120.5 },
    { source: "Digistore24", total: 80 },
    { source: "Affiliate Pro X", total: 25 },
  ]);
});

test("the year list always includes this year, newest first", () => {
  assert.deepEqual(yearsAvailable({ entries, payouts, conversions }, new Date("2027-01-15T12:00:00Z")), [2027, 2026, 2025]);
  assert.deepEqual(yearsAvailable({}, new Date("2026-05-01T12:00:00Z")), [2026]);
});

test("the CSV has the rows, the total, and the reference section kept apart", () => {
  const csv = taxReportCsv(buildTaxYearReport({ entries, payouts, conversions, year: 2026 }));
  assert.ok(csv.includes("2026-03-05,ClickBank,Payment received,120.50,March check"));
  assert.ok(csv.includes("Total received,,,225.50,"));
  assert.ok(csv.includes("reference only, not added to the total"));
});

test("a typed note can't become a spreadsheet formula, and commas are quoted", () => {
  const csv = taxReportCsv(
    buildTaxYearReport({
      entries: [{ id: "x", received_on: "2026-01-01", source: "Other", amount: 1, note: '=HYPERLINK("x"), hi' }],
      year: 2026,
    })
  );
  assert.ok(csv.includes(`"'=HYPERLINK(""x""), hi"`));
});
