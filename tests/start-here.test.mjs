import assert from "node:assert/strict";
import test from "node:test";
import { startHereComplete, startHereSteps } from "../src/lib/startHere.js";

const done = (steps) => steps.filter((s) => s.done).map((s) => s.id);

test("a brand-new account has nothing done", () => {
  const steps = startHereSteps({ user: {}, links: [] });
  assert.deepEqual(done(steps), []);
  assert.equal(startHereComplete(steps), false);
});

test("a saved network id or a ClickBank nickname counts as joining a network", () => {
  assert.deepEqual(done(startHereSteps({ user: { affiliate_network_ids: { digistore24: "x" } } })), ["network"]);
  assert.deepEqual(done(startHereSteps({ user: { clickbank_nickname: "abc" } })), ["network"]);
  assert.deepEqual(done(startHereSteps({ user: { clickbank_nickname: "  " } })), []);
});

test("a link alone isn't 'shared' until it is featured or clicked", () => {
  const user = { clickbank_nickname: "abc" };
  assert.deepEqual(done(startHereSteps({ user, links: [{ clicks: 0 }] })), ["network", "link"]);
  assert.equal(startHereComplete(startHereSteps({ user, links: [{ clicks: 1 }] })), true);
  assert.equal(startHereComplete(startHereSteps({ user, links: [{ bio_featured_at: "2026-10-01" }] })), true);
});
