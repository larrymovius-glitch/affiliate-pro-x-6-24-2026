import assert from "node:assert/strict";
import test from "node:test";
import { listingFacts } from "../api/syncEbayTrending.js";

// An ad script can only say "new, sealed, ships free from the US" if the
// listing says so. These facts are what it is allowed to draw on -- and the
// absence of one is what stops it being claimed.

const item = (over = {}) => ({
  condition: "New",
  itemLocation: { country: "US" },
  shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "0.00", currency: "USD" } }],
  seller: { feedbackPercentage: "99.4" },
  ...over,
});

test("condition, origin, free shipping and seller rating are recorded", () => {
  const facts = listingFacts(item());
  assert.match(facts, /Condition: New/);
  assert.match(facts, /Ships from: US/);
  assert.match(facts, /Shipping: free/);
  assert.match(facts, /99\.4%/);
});

test("shipping is only called free when it actually costs nothing", () => {
  assert.doesNotMatch(
    listingFacts(item({ shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "12.99" } }] })),
    /free/
  );
  assert.doesNotMatch(listingFacts(item({ shippingOptions: [{ shippingCostType: "CALCULATED" }] })), /free/);
  assert.doesNotMatch(listingFacts(item({ shippingOptions: [] })), /free/);
});

test("a missing detail is left out rather than filled in", () => {
  assert.doesNotMatch(listingFacts(item({ condition: undefined })), /Condition/);
  assert.doesNotMatch(listingFacts(item({ itemLocation: undefined })), /Ships from/);
  assert.equal(listingFacts({}), "");
  assert.equal(listingFacts(null), "");
});

test("no price is recorded", () => {
  // A video outlives the price it quotes, and a stale price in an ad is a
  // claim that has become untrue.
  const facts = listingFacts(item({ price: { value: "499.99", currency: "USD" } }));
  assert.doesNotMatch(facts, /499/);
  assert.doesNotMatch(facts, /\$/);
});
