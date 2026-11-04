import { getAuthedUser } from "./_lib/supabase.js";
import { paypalFetch } from "./_lib/paypal.js";
import { db } from "./_lib/db.js";
import { TEST_SUBSCRIPTION_PLAN, canUseTestSubscription } from "./_lib/testSubscription.js";

export { TEST_SUBSCRIPTION_PLAN, canUseTestSubscription };

// Lifetime is a one-time PayPal Order (v2 Checkout Orders API). Monthly/
// yearly are recurring PayPal Subscriptions (v1 Billing Subscriptions API) --
// a different PayPal product entirely, which is why this file branches into
// two shapes of request instead of just varying the amount.
//
// A subscription can't be created against an arbitrary price the way an
// order can -- PayPal requires a pre-existing Billing Plan to subscribe to.
// PAYPAL_MONTHLY_PLAN_ID / PAYPAL_YEARLY_PLAN_ID are that plan's ID, created
// once in the PayPal dashboard (Pay & Get Paid > Subscriptions > Plans),
// exactly the same one-time setup api/createStripeCheckout.js's hardcoded
// priceIds already require on the Stripe side.
//
// The same applies to the admin-only $1/month test subscription:
// create a $1/month Billing Plan in the PayPal dashboard and put its ID
// (P-...) in PAYPAL_TEST_PLAN_ID. Without it, a test subscription returns
// "PayPal test subscription is not configured yet" instead of starting
// a checkout. See docs/test-subscription.md.
const LIFETIME_PRICE = "997.00";
const SUBSCRIPTION_PLAN_IDS = {
  monthly: process.env.PAYPAL_MONTHLY_PLAN_ID,
  yearly: process.env.PAYPAL_YEARLY_PLAN_ID,
  test_subscription: process.env.PAYPAL_TEST_PLAN_ID,
};
const SUBSCRIPTION_PLAN_ID_ENV_NAMES = {
  monthly: "PAYPAL_MONTHLY_PLAN_ID",
  yearly: "PAYPAL_YEARLY_PLAN_ID",
  test_subscription: "PAYPAL_TEST_PLAN_ID",
};

export default async function handler(req, res) {
  try {
    if (!process.env.VITE_PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.error("PayPal checkout error: PayPal credentials not configured");
      return res.status(500).json({ error: "Payment configuration is incomplete" });
    }

    const { user } = await getAuthedUser(req);
    const { planType } = req.body || {};

    if (!["lifetime", "monthly", "yearly", TEST_SUBSCRIPTION_PLAN].includes(planType)) {
      return res.status(400).json({ error: "Invalid plan type" });
    }

    if (planType === TEST_SUBSCRIPTION_PLAN && !canUseTestSubscription(user)) {
      return res.status(403).json({ error: "Invalid plan type" });
    }

    // An admin testing the subscription path must actually be charged --
    // the veteran shortcut would otherwise return free access and skip
    // the payment entirely, which defeats the test.
    if (planType !== TEST_SUBSCRIPTION_PLAN && ["verified_veteran", "disabled_vet", "homeless_vet"].includes(user?.veteran_status)) {
      return res.status(200).json({ message: "Veteran discount applied - free access granted", veteranAccess: true });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    if (planType === "monthly" || planType === "yearly" || planType === TEST_SUBSCRIPTION_PLAN) {
      return await createSubscription({ req, res, user, planType, origin });
    }

    const order = await paypalFetch("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: user?.id || "",
            description: "Affiliate Pro X - Lifetime Access",
            amount: { currency_code: "USD", value: LIFETIME_PRICE },
          },
        ],
        application_context: {
          brand_name: "Affiliate Pro X",
          user_action: "PAY_NOW",
          return_url: `${origin}/payment-success`,
          cancel_url: `${origin}/pricing?canceled=true`,
        },
      }),
    });

    const approveLink = order.links?.find((l) => l.rel === "approve")?.href;
    if (!approveLink) throw new Error("PayPal did not return an approval link");

    // Record the order before sending the buyer to PayPal. Capture happens on
    // the /payment-success redirect, so without a row written here there is no
    // trace that an order ever existed if the buyer never makes it back --
    // nothing to reconcile against, and an approved order that was never
    // captured just expires silently. reconcilePaypalPayments picks these up.
    try {
      await db().Payment.create({
        // This route has no auth guard, so `user` can be null. A row with no
        // owner still records that money moved (visible to an admin), it just
        // can't have a tier granted against it -- reconciliation logs that case.
        user_id: user?.id || null,
        amount: Number(LIFETIME_PRICE),
        currency: "usd",
        status: "pending",
        payment_method: "paypal",
        transaction_id: order.id,
        plan_type: "lifetime",
        veteran_status: "regular",
        description: "PayPal Lifetime checkout started",
      });
    } catch (recordError) {
      // Don't block checkout on this -- the buyer can still pay and the normal
      // redirect path still records the capture. It only costs the safety net.
      console.error("Failed to record pending PayPal order:", order.id, recordError.message);
    }

    res.status(200).json({ url: approveLink, orderId: order.id });
  } catch (error) {
    console.error("PayPal checkout error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function createSubscription({ res, user, planType, origin }) {
  const planId = SUBSCRIPTION_PLAN_IDS[planType];
  if (!planId) {
    const envName = SUBSCRIPTION_PLAN_ID_ENV_NAMES[planType] || "PAYPAL_MONTHLY_PLAN_ID";
    console.error(`PayPal ${planType} checkout error: ${envName} not configured`);
    if (planType === TEST_SUBSCRIPTION_PLAN) {
      return res.status(500).json({ error: "PayPal test subscription is not configured yet" });
    }
    return res.status(500).json({ error: "PayPal subscriptions are not configured for this plan yet" });
  }

  const subscription = await paypalFetch("/v1/billing/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      custom_id: user?.id || "",
      application_context: {
        brand_name: "Affiliate Pro X",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${origin}/payment-success`,
        cancel_url: `${origin}/pricing?canceled=true`,
      },
    }),
  });

  const approveLink = subscription.links?.find((l) => l.rel === "approve")?.href;
  if (!approveLink) throw new Error("PayPal did not return an approval link");

  // Same safety-net reasoning as the Lifetime order above: a row written now
  // is the only trace this subscription ever existed if the buyer never
  // makes it back to /payment-success. Unlike an order, nothing later
  // "captures" it explicitly -- capturePaypalSubscription and paypalWebhook.js
  // both just flip this same row to completed once PayPal confirms it's
  // active, whichever gets there first.
  try {
    await db().Payment.create({
      user_id: user?.id || null,
      amount: 0, // unknown until the plan's real price comes back on a paypalWebhook/capture event
      currency: "usd",
      status: "pending",
      payment_method: "paypal",
      transaction_id: subscription.id,
      plan_type: planType,
      veteran_status: "regular",
      description: `PayPal ${planType} subscription checkout started`,
    });
  } catch (recordError) {
    console.error("Failed to record pending PayPal subscription:", subscription.id, recordError.message);
  }

  res.status(200).json({ url: approveLink, subscriptionId: subscription.id });
}
