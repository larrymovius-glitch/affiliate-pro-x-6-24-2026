import assert from "node:assert/strict";
import test from "node:test";
import { downgradeIfEligible } from "../api/stripeWebhook.js";

// A lapsed or canceled subscription must not be able to strip access from
// the two groups whose access does not depend on a live subscription:
// verified veterans (free permanently, by design) and anyone holding a
// completed one-time lifetime purchase.
function fakeDb({ profile, payments = [] } = {}) {
  const updates = [];
  return {
    updates,
    User: {
      filter: async ({ id }) => (profile && profile.id === id ? [profile] : []),
      update: async (id, payload) => { updates.push({ id, payload }); return { id, ...payload }; },
    },
    Payment: {
      filter: async (query) =>
        payments.filter((p) => Object.entries(query).every(([k, v]) => p[k] === v)),
    },
  };
}

test("downgrades an ordinary paying user whose subscription ended", async () => {
  const D = fakeDb({ profile: { id: "u1", subscription_tier: "pro" } });
  await downgradeIfEligible(D, "u1");
  assert.deepEqual(D.updates, [{ id: "u1", payload: { subscription_tier: "free" } }]);
});

test("never downgrades a verified veteran", async () => {
  const D = fakeDb({ profile: { id: "u1", subscription_tier: "veteran_free" } });
  await downgradeIfEligible(D, "u1");
  assert.equal(D.updates.length, 0, "veteran free access is permanent, not subscription-dependent");
});

test("never downgrades someone holding a completed lifetime purchase", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [{ user_id: "u1", plan_type: "lifetime", status: "completed" }],
  });
  await downgradeIfEligible(D, "u1");
  assert.equal(D.updates.length, 0, "a lifetime purchase outlives any subscription");
});

test("an incomplete lifetime payment does not protect against downgrade", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [{ user_id: "u1", plan_type: "lifetime", status: "pending" }],
  });
  await downgradeIfEligible(D, "u1");
  assert.deepEqual(D.updates, [{ id: "u1", payload: { subscription_tier: "free" } }]);
});

test("another user's lifetime purchase does not protect this user", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [{ user_id: "someone-else", plan_type: "lifetime", status: "completed" }],
  });
  await downgradeIfEligible(D, "u1");
  assert.deepEqual(D.updates, [{ id: "u1", payload: { subscription_tier: "free" } }]);
});

test("does nothing when the user id is missing or the profile is gone", async () => {
  const D = fakeDb({ profile: { id: "u1", subscription_tier: "pro" } });
  await downgradeIfEligible(D, undefined);
  await downgradeIfEligible(D, "does-not-exist");
  assert.equal(D.updates.length, 0);
});
