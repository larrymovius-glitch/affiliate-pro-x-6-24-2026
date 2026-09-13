import assert from "node:assert/strict";
import test from "node:test";
import { invoiceSubscriptionId, subscriptionPeriod } from "../api/stripeWebhook.js";

// A Stripe webhook destination sends events in the API version it was
// created with, not the SDK's pinned apiVersion. Version 2025-03-31
// ("basil") moved an invoice's subscription ID under `parent` and the
// billing period onto subscription items, so both shapes must be read --
// otherwise renewals silently stop being recorded.

test("reads the subscription ID from an older-style invoice", () => {
  assert.equal(invoiceSubscriptionId({ subscription: "sub_old" }), "sub_old");
});

test("reads the subscription ID from a newer-style invoice", () => {
  assert.equal(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_new" } } }), "sub_new");
});

test("returns null for a one-off invoice with no subscription", () => {
  assert.equal(invoiceSubscriptionId({ parent: null }), null);
});

test("reads the billing period from an older-style subscription", () => {
  const period = subscriptionPeriod({ current_period_start: 1788000000, current_period_end: 1790592000 });
  assert.equal(period.current_period_start, new Date(1788000000 * 1000).toISOString());
  assert.equal(period.current_period_end, new Date(1790592000 * 1000).toISOString());
});

test("reads the billing period from a newer-style subscription's first item", () => {
  const period = subscriptionPeriod({ items: { data: [{ current_period_start: 1788000000, current_period_end: 1790592000 }] } });
  assert.equal(period.current_period_start, new Date(1788000000 * 1000).toISOString());
  assert.equal(period.current_period_end, new Date(1790592000 * 1000).toISOString());
});

test("leaves the period empty when neither shape has it", () => {
  assert.deepEqual(subscriptionPeriod({}), { current_period_start: null, current_period_end: null });
});
