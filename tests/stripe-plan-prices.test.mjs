import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanPrice, SUBSCRIPTION_PRICES } from "../api/createStripeCheckout.js";
import { plans } from "../src/lib/pricingPlans.js";

// Monthly/yearly prices are found by lookup key in whichever Stripe account
// the key belongs to, and created there the first time they're missing --
// never hardcoded, since a price ID only exists in the account and
// live/test mode it was made in.
function fakeStripe({ existing = [], createFails = false, appearsAfterFailedCreate = null } = {}) {
  const prices = [...existing];
  const created = [];
  return {
    created,
    prices: {
      list: async ({ lookup_keys, active }) => ({
        data: prices.filter((p) => lookup_keys.includes(p.lookup_key) && (active === undefined || p.active === active)),
      }),
      create: async (params) => {
        if (createFails) {
          if (appearsAfterFailedCreate) prices.push(appearsAfterFailedCreate);
          throw new Error("A price with this lookup_key already exists");
        }
        const price = { id: `price_new_${created.length + 1}`, active: true, ...params };
        created.push(params);
        prices.push(price);
        return price;
      },
    },
  };
}

test("reuses the existing price for a plan's lookup key", async () => {
  const stripe = fakeStripe({ existing: [{ id: "price_existing", lookup_key: "affiliate_pro_x_monthly", active: true }] });
  assert.equal(await resolvePlanPrice(stripe, "monthly"), "price_existing");
  assert.equal(stripe.created.length, 0);
});

test("creates the monthly price at $29/month when it doesn't exist yet", async () => {
  const stripe = fakeStripe();
  assert.equal(await resolvePlanPrice(stripe, "monthly"), "price_new_1");
  const [params] = stripe.created;
  assert.equal(params.unit_amount, 2900);
  assert.equal(params.currency, "usd");
  assert.deepEqual(params.recurring, { interval: "month" });
  assert.equal(params.lookup_key, SUBSCRIPTION_PRICES.monthly.lookupKey);
});

test("creates the yearly price at $290/year when it doesn't exist yet", async () => {
  const stripe = fakeStripe();
  await resolvePlanPrice(stripe, "yearly");
  assert.equal(stripe.created[0].unit_amount, 29000);
  assert.deepEqual(stripe.created[0].recurring, { interval: "year" });
});

test("skips an archived price instead of charging against it", async () => {
  const stripe = fakeStripe({ existing: [{ id: "price_archived", lookup_key: "affiliate_pro_x_monthly", active: false }] });
  assert.equal(await resolvePlanPrice(stripe, "monthly"), "price_new_1");
});

test("uses the price another checkout just created when two race to create it", async () => {
  const stripe = fakeStripe({
    createFails: true,
    appearsAfterFailedCreate: { id: "price_from_other_request", lookup_key: "affiliate_pro_x_yearly", active: true },
  });
  assert.equal(await resolvePlanPrice(stripe, "yearly"), "price_from_other_request");
});

test("surfaces the create error when no price turns up", async () => {
  const stripe = fakeStripe({ createFails: true });
  await assert.rejects(resolvePlanPrice(stripe, "monthly"), /already exists/);
});

test("charges exactly what the pricing page shows", () => {
  for (const id of ["monthly", "yearly"]) {
    const shown = Number(plans.find((p) => p.id === id).price.replace(/[^0-9.]/g, ""));
    assert.equal(SUBSCRIPTION_PRICES[id].unitAmount, Math.round(shown * 100), `${id} price drifted from the pricing page`);
  }
});
