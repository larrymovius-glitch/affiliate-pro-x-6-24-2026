import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePlanPrice,
  SUBSCRIPTION_PRICES,
  TEST_SUBSCRIPTION_PLAN,
  canUseTestSubscription,
} from "../api/createStripeCheckout.js";
import { canUseTestSubscription as canUsePaypalTestSubscription } from "../api/createPaypalOrder.js";
import { subscriptionTablePlanType } from "../api/_lib/testSubscription.js";
import { syncSubscription } from "../api/stripeWebhook.js";
import {
  activatePaypalSubscription,
  recordPaypalSubscriptionCharge,
} from "../api/_lib/paypalSubscriptions.js";

// Admin-only $1/month test subscription (docs/test-subscription.md).
// This is the subscription path PayPal Monthly/Yearly had never
// completed: checkout -> approval -> activation -> Payment row ->
// tier grant. The gate is server-side -- hiding the Pricing card
// is convenience only -- so the gate itself is pinned here, along
// with the $1/month price and the activation flow for this plan.

function fakeStripe({ existing = [] } = {}) {
  const prices = [...existing];
  const created = [];
  return {
    created,
    prices: {
      list: async ({ lookup_keys, active }) => ({
        data: prices.filter((p) => lookup_keys.includes(p.lookup_key) && (active === undefined || p.active === active)),
      }),
      create: async (params) => {
        const price = { id: `price_new_${created.length + 1}`, active: true, ...params };
        created.push(params);
        prices.push(price);
        return price;
      },
    },
  };
}

function fakeDb({ payments = [] } = {}) {
  const updates = [];
  const created = [];
  return {
    updates,
    created,
    User: {
      update: async (id, payload) => { updates.push({ id, payload }); return { id, ...payload }; },
    },
    Payment: {
      filter: async (query) =>
        [...payments, ...created].filter((p) => Object.entries(query).every(([k, v]) => p[k] === v)),
      update: async (id, payload) => { updates.push({ id, payload }); return { id, ...payload }; },
      create: async (payload) => { created.push(payload); return { id: `created-${created.length}`, ...payload }; },
    },
  };
}

// Mirrors the live subscriptions_plan_type_check constraint in Supabase:
// CHECK (plan_type IN ('monthly','yearly','lifetime')). Writing anything
// else throws, the way Postgres does, so the webhook would 500.
const ALLOWED_SUBSCRIPTION_PLAN_TYPES = new Set(["monthly", "yearly", "lifetime"]);
function fakeSubscriptionTable() {
  const table = [];
  const check = (record) => {
    if (!ALLOWED_SUBSCRIPTION_PLAN_TYPES.has(record.plan_type)) {
      const err = new Error('new row for relation "subscriptions" violates check constraint "subscriptions_plan_type_check"');
      err.code = "23514";
      throw err;
    }
  };
  return {
    table,
    Subscription: {
      filter: async ({ stripe_subscription_id }) => table.filter((r) => r.stripe_subscription_id === stripe_subscription_id),
      create: async (record) => { check(record); const row = { id: `row-${table.length + 1}`, ...record }; table.push(row); return row; },
      update: async (id, record) => { check(record); const row = table.find((r) => r.id === id); Object.assign(row, record); return row; },
    },
  };
}

function liveStripe(live) {
  return { subscriptions: { retrieve: async (id) => ({ id, ...live }) } };
}

const testSubMetadata = { app_id: "affiliate-pro-x", user_id: "u1", plan_type: "test_subscription" };

test("test subscription plan is $1/month with its own lookup key", () => {
  assert.equal(TEST_SUBSCRIPTION_PLAN, "test_subscription");
  assert.equal(SUBSCRIPTION_PRICES.test_subscription.unitAmount, 100);
  assert.equal(SUBSCRIPTION_PRICES.test_subscription.interval, "month");
  assert.equal(SUBSCRIPTION_PRICES.test_subscription.lookupKey, "affiliate_pro_x_test_subscription");
});

test("resolvePlanPrice creates the $1/month test price when it doesn't exist yet", async () => {
  const stripe = fakeStripe();
  assert.equal(await resolvePlanPrice(stripe, "test_subscription"), "price_new_1");
  const [params] = stripe.created;
  assert.equal(params.unit_amount, 100);
  assert.equal(params.currency, "usd");
  assert.deepEqual(params.recurring, { interval: "month" });
  assert.equal(params.lookup_key, "affiliate_pro_x_test_subscription");
});

test("only an admin can use the test subscription -- Stripe gate", () => {
  assert.equal(canUseTestSubscription({ role: "admin" }), true);
  assert.equal(canUseTestSubscription({ role: "user" }), false);
  assert.equal(canUseTestSubscription(null), false);
  assert.equal(canUseTestSubscription({}), false);
});

test("only an admin can use the test subscription -- PayPal gate", () => {
  assert.equal(canUsePaypalTestSubscription({ role: "admin" }), true);
  assert.equal(canUsePaypalTestSubscription({ role: "user" }), false);
  assert.equal(canUsePaypalTestSubscription(null), false);
});

test("the subscriptions table gets monthly for a test subscription, other plans unchanged", () => {
  assert.equal(subscriptionTablePlanType("test_subscription"), "monthly");
  assert.equal(subscriptionTablePlanType("monthly"), "monthly");
  assert.equal(subscriptionTablePlanType("yearly"), "yearly");
});

test("a Stripe test subscription syncs as monthly instead of breaking the table's check constraint", async () => {
  const D = fakeSubscriptionTable();
  await syncSubscription(D, liveStripe({ status: "active", customer: "cus_1", metadata: testSubMetadata }), {
    id: "sub_test_1",
    status: "incomplete",
    metadata: testSubMetadata,
  });

  assert.equal(D.table.length, 1);
  assert.equal(D.table[0].plan_type, "monthly");
  assert.equal(D.table[0].status, "active");
});

test("cancelling a Stripe test subscription syncs as monthly + canceled, so the downgrade can run", async () => {
  const D = fakeSubscriptionTable();
  D.table.push({ id: "row-1", stripe_subscription_id: "sub_test_1", plan_type: "monthly", status: "active" });

  const subscription = await syncSubscription(
    D,
    liveStripe({ status: "canceled", customer: "cus_1", canceled_at: 1767225600, metadata: testSubMetadata }),
    { id: "sub_test_1", status: "canceled", metadata: testSubMetadata },
  );

  assert.equal(subscription.status, "canceled");
  assert.equal(D.table[0].plan_type, "monthly");
  assert.equal(D.table[0].status, "canceled");
  // Stripe's own record keeps the real name.
  assert.equal(subscription.metadata.plan_type, "test_subscription");
});

test("activating a test subscription flips its checkout row and grants pro, at amount 0", async () => {
  const D = fakeDb({
    payments: [{ id: "p1", user_id: "u1", transaction_id: "sub_test_1", plan_type: "test_subscription", status: "pending", amount: 0 }],
  });
  const outcome = await activatePaypalSubscription(D, { subscriptionId: "sub_test_1", userId: "u1", planType: null });

  assert.equal(outcome, "activated");
  assert.deepEqual(D.updates[0], {
    id: "p1",
    payload: { status: "completed", description: "PayPal test_subscription subscription activated (charge recorded separately)" },
  });
  assert.deepEqual(D.updates[1], { id: "u1", payload: { subscription_tier: "pro" } });
});

test("the first $1 sale for a test subscription is recorded exactly once", async () => {
  const D = fakeDb({
    payments: [{ id: "p1", user_id: "u1", transaction_id: "sub_test_1", plan_type: "test_subscription", status: "pending", amount: 0 }],
  });

  await activatePaypalSubscription(D, { subscriptionId: "sub_test_1", userId: "u1", planType: null });
  const outcome = await recordPaypalSubscriptionCharge(D, {
    saleId: "sale_test_1",
    subscriptionId: "sub_test_1",
    userId: "u1",
    planType: "test_subscription",
    amount: 1,
    currency: "usd",
  });

  assert.equal(outcome, "recorded");
  const chargeRows = D.created.filter((p) => p.amount > 0);
  assert.equal(chargeRows.length, 1);
  assert.equal(chargeRows[0].amount, 1);
  assert.equal(chargeRows[0].plan_type, "test_subscription");
});
