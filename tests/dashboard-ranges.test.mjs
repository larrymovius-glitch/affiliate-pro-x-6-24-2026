import test from "node:test";
import assert from "node:assert/strict";
import { eventsInWindow, rangeSummary, topProducts, toCsv, greetingFor, rangeById } from "../src/lib/dashboard-ranges.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const clicks = [
  { clicked_at: daysAgo(1), short_code: "A", product_name: "Amino" },
  { clicked_at: daysAgo(2), short_code: "A", product_name: "Amino" },
  { clicked_at: daysAgo(3), short_code: "C", product_name: "Curler" },
  { clicked_at: daysAgo(10), short_code: "A", product_name: "Amino" },
  { clicked_at: daysAgo(40), short_code: "P", product_name: "ProDentim" },
];
const conversions = [{ converted_at: daysAgo(2), amount: 12.5 }, { converted_at: daysAgo(9), amount: 5 }];

test("eventsInWindow uses the real date column and the offset window", () => {
  assert.equal(eventsInWindow(clicks, "clicked_at", 7, NOW).length, 3);
  assert.equal(eventsInWindow(clicks, "clicked_at", 7, NOW, 7).length, 1);
  assert.equal(eventsInWindow(clicks, "clicked_at", 30, NOW).length, 4);
});

test("rangeSummary counts only the chosen range and compares with the one before", () => {
  const s = rangeSummary({ clickEvents: clicks, conversionEvents: conversions, days: 7, now: NOW });
  assert.equal(s.clicks, 3);
  assert.equal(s.conversions, 1);
  assert.equal(s.earnings, 12.5);
  assert.equal(s.epc, 12.5 / 3);
  assert.equal(s.conversionsDelta, 0); // 1 this week vs 1 the week before
});

test("rangeSummary all-time keeps the app-wide totals", () => {
  const s = rangeSummary({ clickEvents: clicks, conversionEvents: conversions, days: null, now: NOW });
  assert.equal(s.clicks, 5);
  assert.equal(s.conversions, 2);
  assert.equal(s.earnings, 17.5);
});

test("topProducts ranks by clicks within the range", () => {
  assert.deepEqual(topProducts(clicks, 30, 5, NOW), [
    { name: "Amino", clicks: 3 },
    { name: "Curler", clicks: 1 },
  ]);
  assert.equal(topProducts(clicks, null, 5, NOW).length, 3);
});

test("toCsv quotes cells that need it", () => {
  const csv = toCsv([{ d: "Oct 1", n: 'a "b", c' }], [{ key: "d", label: "Date" }, { key: "n", label: "Note" }]);
  assert.equal(csv, 'Date,Note\nOct 1,"a ""b"", c"');
});

test("greeting and range lookup", () => {
  assert.equal(greetingFor(8), "Good morning");
  assert.equal(greetingFor(14), "Good afternoon");
  assert.equal(greetingFor(23), "Good evening");
  assert.equal(rangeById("nope").id, "all");
});
