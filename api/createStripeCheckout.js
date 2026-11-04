import Stripe from "stripe";
import { getAuthedUser } from "./_lib/supabase.js";
import { TEST_SUBSCRIPTION_PLAN, canUseTestSubscription } from "./_lib/testSubscription.js";

export { TEST_SUBSCRIPTION_PLAN, canUseTestSubscription };

// Monthly/yearly prices are looked up by lookup_key in whichever Stripe
// account STRIPE_SECRET_KEY belongs to, and created there the first time
// they're missing. They used to be hardcoded price IDs, which broke as soon
// as the key changed: a price only exists in the account (and live/test
// mode) it was made in. Amounts match src/lib/pricingPlans.js -- see
// tests/stripe-plan-prices.test.mjs, which fails if the two drift apart.
export const SUBSCRIPTION_PRICES = {
  monthly: { lookupKey: "affiliate_pro_x_monthly", unitAmount: 2900, interval: "month", name: "Affiliate Pro X Monthly" },
  yearly: { lookupKey: "affiliate_pro_x_yearly", unitAmount: 29000, interval: "year", name: "Affiliate Pro X Yearly" },
  // Admin-only $1/month test subscription. Same subscription flow as
  // monthly/yearly (Checkout session -> webhook -> tier grant), at $1, so
  // the live subscription path can be verified without spending $29/$290.
  // See docs/test-subscription.md. It is deliberately NOT in
  // src/lib/pricingPlans.js -- that list is the public plans.
  test_subscription: { lookupKey: "affiliate_pro_x_test_subscription", unitAmount: 100, interval: "month", name: "Affiliate Pro X Test Subscription ($1/month)" },
};

export async function resolvePlanPrice(stripe, planType) {
  const plan = SUBSCRIPTION_PRICES[planType];
  const findExisting = async () => {
    const { data } = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
    return data[0]?.id || null;
  };

  const existing = await findExisting();
  if (existing) return existing;

  try {
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: { interval: plan.interval },
      lookup_key: plan.lookupKey,
      product_data: { name: plan.name },
    });
    return price.id;
  } catch (err) {
    // Two first-ever checkouts racing: the other one created the price a
    // moment ago and lookup keys are unique, so this create fails. Use theirs.
    const createdMeanwhile = await findExisting();
    if (createdMeanwhile) return createdMeanwhile;
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error("Stripe checkout error: STRIPE_SECRET_KEY not configured");
      return res.status(500).json({ error: "Payment configuration is incomplete" });
    }

    const { user } = await getAuthedUser(req);
    const { planType, email } = req.body || {};

    const validPlans = ["monthly", "yearly", "lifetime", TEST_SUBSCRIPTION_PLAN];
    if (!validPlans.includes(planType)) {
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const subscriptionPriceId = planType === "lifetime" ? null : await resolvePlanPrice(stripe, planType);
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const customerEmail = user?.email || email || "";
    const metadata = {
      app_id: "affiliate-pro-x",
      user_id: user?.id || "",
      user_email: customerEmail,
      plan_type: planType,
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items:
        planType === "lifetime"
          ? [{ price_data: { currency: "usd", product_data: { name: "Affiliate Pro X - Lifetime Access" }, unit_amount: 99700 }, quantity: 1 }]
          : [{ price: subscriptionPriceId, quantity: 1 }],
      mode: planType === "lifetime" ? "payment" : "subscription",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(planType === "lifetime" ? { payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
    });

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: error.message });
  }
}
