import assert from "node:assert/strict";
import test from "node:test";
import createStripeCheckout from "../api/createStripeCheckout.js";
import createPaypalOrder from "../api/createPaypalOrder.js";

// A checkout must belong to a logged-in user. Both webhooks grant the paid
// tier from the user id stored on the checkout (Stripe metadata.user_id,
// PayPal custom_id). A checkout created without one used to take the
// buyer's money and grant nothing, and PayPal rejected the empty custom_id
// with a 500. These pin the refusal: no user, no checkout, no outside call.

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function callLoggedOut(handler, body) {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.VITE_PAYPAL_CLIENT_ID = "dummy-client";
  process.env.PAYPAL_CLIENT_SECRET = "dummy-secret";
  globalThis.fetch = async () => {
    throw new Error("checkout made an outside call for a logged-out request");
  };
  try {
    const res = fakeRes();
    await handler({ headers: { host: "apx.example" }, body }, res);
    return res;
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
}

for (const [name, handler] of [
  ["createStripeCheckout", createStripeCheckout],
  ["createPaypalOrder", createPaypalOrder],
]) {
  for (const planType of ["monthly", "yearly", "lifetime"]) {
    test(`${name} refuses a logged-out ${planType} checkout with 401`, async () => {
      const res = await callLoggedOut(handler, { planType });
      assert.equal(res.statusCode, 401);
      assert.match(res.body.error, /log in/i);
    });
  }

  test(`${name} ignores an email in the body when there is no login`, async () => {
    const res = await callLoggedOut(handler, { planType: "monthly", email: "someone@example.com" });
    assert.equal(res.statusCode, 401);
  });
}
