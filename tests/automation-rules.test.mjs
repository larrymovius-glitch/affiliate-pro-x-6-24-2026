import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  REFIRE_WINDOW_MS, buildNotification, compare, isDue, matchingLinks, metricFor,
} from "../api/_lib/automationRules.js";

const owner = "user-a";
const link = (over = {}) => ({ created_by_id: owner, is_active: true, clicks: 0, conversions: 0, earnings: 0, product_name: "Widget", ...over });
const rule = (over = {}) => ({ id: "r1", name: "Test", created_by_id: owner, trigger_metric: "clicks", trigger_operator: "gte", threshold: 10, action: "send_alert", is_active: true, last_triggered_at: null, ...over });

test("rates are undefined with no clicks, so new links never match a rate rule", () => {
  assert.equal(metricFor(link(), "epc"), null);
  assert.equal(metricFor(link(), "conversion_rate"), null);
  assert.equal(matchingLinks(rule({ trigger_metric: "conversion_rate", trigger_operator: "lte", threshold: 5 }), [link()]).length, 0);
});

test("metrics are computed from the link's own counters", () => {
  const l = link({ clicks: 20, conversions: 2, earnings: 10 });
  assert.equal(metricFor(l, "clicks"), 20);
  assert.equal(metricFor(l, "earnings"), 10);
  assert.equal(metricFor(l, "epc"), 0.5);
  assert.equal(metricFor(l, "conversion_rate"), 10);
});

test("gte and lte compare inclusively; unknown operators never match", () => {
  assert.equal(compare(10, "gte", 10), true);
  assert.equal(compare(9, "gte", 10), false);
  assert.equal(compare(10, "lte", 10), true);
  assert.equal(compare(10, "between", 10), false);
});

test("a rule only sees its own owner's active links", () => {
  const links = [link({ clicks: 50 }), link({ clicks: 50, created_by_id: "someone-else" }), link({ clicks: 50, is_active: false })];
  assert.equal(matchingLinks(rule(), links).length, 1);
});

test("a rule fires at most once per window and never when paused", () => {
  const now = Date.now();
  assert.equal(isDue(rule(), now), true);
  assert.equal(isDue(rule({ is_active: false }), now), false);
  assert.equal(isDue(rule({ last_triggered_at: new Date(now - 60_000).toISOString() }), now), false);
  assert.equal(isDue(rule({ last_triggered_at: new Date(now - REFIRE_WINDOW_MS).toISOString() }), now), true);
});

test("send_alert produces an alert for the rule's owner", () => {
  const note = buildNotification(rule(), [{ link: link({ clicks: 12 }), value: 12 }]);
  assert.equal(note.type, "general");
  assert.match(note.title, /matched 1 link$/);
  assert.equal(note.user_id, owner);
  assert.match(note.body, /Widget: 12 clicks/);
});

test("actions that would change links escalate to the member instead of acting", () => {
  for (const action of ["promote_winner", "pause_loser", "create_variants", "something_new"]) {
    const note = buildNotification(rule({ action }), [{ link: link(), value: 12 }]);
    assert.equal(note.type, "general", action);
    assert.match(note.title, /needs your OK/);
  }
});

test("the rule form saves the database's column names", () => {
  const form = readFileSync(new URL("../src/components/dashboard/pro-growth/ProRuleForm.jsx", import.meta.url), "utf8");
  assert.match(form, /threshold:/);
  assert.doesNotMatch(form, /connected_surface:/);
  assert.doesNotMatch(form, /trigger_value: Number/);
});

test("notification types stay inside the database's allowed set", () => {
  const allowed = ["payout_completed", "post_published", "milestone", "veteran_status", "general"];
  for (const action of ["send_alert", "pause_loser"]) {
    assert.ok(allowed.includes(buildNotification(rule({ action }), [{ link: link(), value: 1 }]).type));
  }
});

test("the rules job is scheduled", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(config.crons.some((c) => c.path === "/api/runAutomationRules"));
});
