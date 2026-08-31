import assert from "node:assert/strict";
import test from "node:test";
import { grantLifetimeIfEarned } from "../api/stripeWebhook.js";

// Subscription payments (monthly/yearly) count toward the $997 lifetime
// price. Once a user's completed payments add up to that, they've earned
// lifetime -- stop charging them and record it the same way a direct
// lifetime purchase would (a completed Payment row with plan_type
// "lifetime"), which is also what downgradeIfEligible already checks for.
function fakeDb({ profile, payments = [], subscriptions = [] } = {}) {
  const updates = [];
  const created = [];
  return {
    updates,
    created,
    User: {
      filter: async ({ id }) => (profile && profile.id === id ? [profile] : []),
      update: async (id, payload) => { updates.push({ id, payload }); return { id, ...payload }; },
    },
    Payment: {
      filter: async (query) =>
        [...payments, ...created].filter((p) => Object.entries(query).every(([k, v]) => p[k] === v)),
      create: async (payload) => { created.push(payload); return { id: `created-${created.length}`, ...payload }; },
    },
    Subscription: {
      filter: async (query) =>
        subscriptions.filter((s) => Object.entries(query).every(([k, v]) => s[k] === v)),
    },
  };
}

function fakeStripe({ cancelShouldThrow = false } = {}) {
  const canceled = [];
  return {
    canceled,
    subscriptions: {
      cancel: async (id) => {
        if (cancelShouldThrow) throw new Error("Stripe API error");
        canceled.push(id);
      },
    },
  };
}

test("does nothing when payments haven't reached the lifetime price yet", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [{ user_id: "u1", status: "completed", amount: 290 }],
  });
  const stripe = fakeStripe();
  await grantLifetimeIfEarned(D, stripe, "u1");
  assert.equal(D.created.length, 0);
  assert.equal(D.updates.length, 0);
  assert.equal(stripe.canceled.length, 0);
});

test("grants lifetime once cumulative completed payments reach $997", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [
      { user_id: "u1", status: "completed", amount: 290 },
      { user_id: "u1", status: "completed", amount: 290 },
      { user_id: "u1", status: "completed", amount: 290 },
      { user_id: "u1", status: "completed", amount: 290 },
    ],
    subscriptions: [{ user_id: "u1", status: "active", stripe_subscription_id: "sub_123" }],
  });
  const stripe = fakeStripe();
  await grantLifetimeIfEarned(D, stripe, "u1");

  assert.equal(D.created.length, 1);
  assert.equal(D.created[0].plan_type, "lifetime");
  assert.equal(D.created[0].status, "completed");
  assert.equal(D.created[0].amount, 0);
  assert.equal(D.created[0].transaction_id, "lifetime-earned:u1");

  assert.deepEqual(D.updates, [{ id: "u1", payload: { subscription_tier: "pro" } }]);
  assert.deepEqual(stripe.canceled, ["sub_123"]);
});

test("does not re-grant or re-cancel someone who already has lifetime", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [{ user_id: "u1", status: "completed", plan_type: "lifetime", amount: 997 }],
    subscriptions: [{ user_id: "u1", status: "active", stripe_subscription_id: "sub_123" }],
  });
  const stripe = fakeStripe();
  await grantLifetimeIfEarned(D, stripe, "u1");
  assert.equal(D.created.length, 0);
  assert.equal(D.updates.length, 0);
  assert.equal(stripe.canceled.length, 0);
});

test("a webhook retry with the marker already present does not double-grant or double-cancel", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [
      { user_id: "u1", status: "completed", amount: 500 },
      { user_id: "u1", status: "completed", amount: 500 },
      { user_id: "u1", status: "completed", transaction_id: "lifetime-earned:u1", amount: 0 },
    ],
    subscriptions: [{ user_id: "u1", status: "active", stripe_subscription_id: "sub_123" }],
  });
  const stripe = fakeStripe();
  await grantLifetimeIfEarned(D, stripe, "u1");
  assert.equal(D.created.length, 0);
  assert.equal(stripe.canceled.length, 0);
});

test("with no active subscription, still grants lifetime without attempting a cancel", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [{ user_id: "u1", status: "completed", amount: 1000 }],
    subscriptions: [],
  });
  const stripe = fakeStripe();
  await grantLifetimeIfEarned(D, stripe, "u1");
  assert.equal(D.created.length, 1);
  assert.equal(stripe.canceled.length, 0);
});

test("a failed Stripe cancel does not stop lifetime from being granted", async () => {
  const D = fakeDb({
    profile: { id: "u1", subscription_tier: "pro" },
    payments: [{ user_id: "u1", status: "completed", amount: 1000 }],
    subscriptions: [{ user_id: "u1", status: "active", stripe_subscription_id: "sub_123" }],
  });
  const stripe = fakeStripe({ cancelShouldThrow: true });
  await grantLifetimeIfEarned(D, stripe, "u1");
  assert.equal(D.created.length, 1, "the Payment row is what actually grants access -- it must survive a Stripe API failure");
});

test("does nothing when userId is missing", async () => {
  const D = fakeDb({ profile: { id: "u1", subscription_tier: "pro" } });
  const stripe = fakeStripe();
  await grantLifetimeIfEarned(D, stripe, undefined);
  assert.equal(D.created.length, 0);
  assert.equal(stripe.canceled.length, 0);
});
