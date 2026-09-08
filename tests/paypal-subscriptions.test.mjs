import assert from "node:assert/strict";
import test from "node:test";
import { activatePaypalSubscription, recordPaypalSubscriptionCharge } from "../api/_lib/paypalSubscriptions.js";

// PayPal fires BILLING.SUBSCRIPTION.ACTIVATED *and* PAYMENT.SALE.COMPLETED
// for a subscription's first payment -- there's no reliable local way to
// tell whether both will actually arrive for a given subscription. So
// activatePaypalSubscription (driven by ACTIVATED, and by the
// /payment-success redirect racing it) never writes a dollar amount; only
// recordPaypalSubscriptionCharge (driven solely by PAYMENT.SALE.COMPLETED,
// one real PayPal "sale" object per call) does. These tests exist to prove
// that split actually prevents double-counting, not just describe it.
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

test("activatePaypalSubscription flips the checkout row to completed at amount 0 and grants the tier", async () => {
  const D = fakeDb({
    payments: [{ id: "p1", user_id: "u1", transaction_id: "sub_1", plan_type: "monthly", status: "pending", amount: 0 }],
  });
  const outcome = await activatePaypalSubscription(D, { subscriptionId: "sub_1", userId: "u1", planType: null });

  assert.equal(outcome, "activated");
  assert.deepEqual(D.updates[0], { id: "p1", payload: { status: "completed", description: "PayPal monthly subscription activated (charge recorded separately)" } });
  assert.deepEqual(D.updates[1], { id: "u1", payload: { subscription_tier: "pro" } });
  assert.equal(D.created.length, 0, "no new Payment row -- only the existing checkout row is updated");
});

test("activatePaypalSubscription creates a zero-amount row when no checkout row exists (webhook arrived first)", async () => {
  const D = fakeDb();
  const outcome = await activatePaypalSubscription(D, { subscriptionId: "sub_2", userId: "u2", planType: "yearly" });

  assert.equal(outcome, "activated");
  assert.equal(D.created.length, 1);
  assert.equal(D.created[0].amount, 0, "activation itself never carries a charge amount");
  assert.equal(D.created[0].status, "completed");
});

test("activatePaypalSubscription is idempotent -- a repeat call (redirect racing the webhook) no-ops", async () => {
  const D = fakeDb({
    payments: [{ id: "p1", user_id: "u1", transaction_id: "sub_1", plan_type: "monthly", status: "completed", amount: 0 }],
  });
  const outcome = await activatePaypalSubscription(D, { subscriptionId: "sub_1", userId: "u1", planType: "monthly" });

  assert.equal(outcome, "skipped");
  assert.equal(D.updates.length, 0);
  assert.equal(D.created.length, 0);
});

test("recordPaypalSubscriptionCharge writes the real amount, keyed by the sale's own unique id", async () => {
  const D = fakeDb();
  const outcome = await recordPaypalSubscriptionCharge(D, {
    saleId: "sale_1",
    subscriptionId: "sub_1",
    userId: "u1",
    planType: "monthly",
    amount: 29,
    currency: "usd",
  });

  assert.equal(outcome, "recorded");
  assert.equal(D.created.length, 1);
  assert.equal(D.created[0].transaction_id, "sale_1");
  assert.equal(D.created[0].amount, 29);
});

test("recordPaypalSubscriptionCharge is idempotent -- a retried webhook delivery of the same sale does not double-charge", async () => {
  const D = fakeDb({
    payments: [{ transaction_id: "sale_1", amount: 29, status: "completed" }],
  });
  const outcome = await recordPaypalSubscriptionCharge(D, {
    saleId: "sale_1",
    subscriptionId: "sub_1",
    userId: "u1",
    planType: "monthly",
    amount: 29,
    currency: "usd",
  });

  assert.equal(outcome, "skipped");
  assert.equal(D.created.length, 0);
});

test("activation plus the first sale together record exactly one charge, not two", async () => {
  // Simulates PayPal firing both ACTIVATED and PAYMENT.SALE.COMPLETED for
  // the same first payment -- the scenario this whole split exists for.
  const D = fakeDb({
    payments: [{ id: "p1", user_id: "u1", transaction_id: "sub_1", plan_type: "monthly", status: "pending", amount: 0 }],
  });

  await activatePaypalSubscription(D, { subscriptionId: "sub_1", userId: "u1", planType: null });
  await recordPaypalSubscriptionCharge(D, {
    saleId: "sale_first",
    subscriptionId: "sub_1",
    userId: "u1",
    planType: "monthly",
    amount: 29,
    currency: "usd",
  });

  const chargeRows = D.created.filter((p) => p.amount > 0);
  assert.equal(chargeRows.length, 1, "exactly one row should ever carry a nonzero amount for this first payment");
  assert.equal(chargeRows[0].amount, 29);
});
