import Stripe from "stripe";
import { getAuthedUser } from "./_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error("Stripe checkout error: STRIPE_SECRET_KEY not configured");
      return res.status(500).json({ error: "Payment configuration is incomplete" });
    }

    const { user } = await getAuthedUser(req);
    const { planType, email } = req.body || {};

    const validPlans = ["monthly", "yearly", "lifetime", "test"];
    if (!validPlans.includes(planType)) {
      return res.status(400).json({ error: "Invalid plan type" });
    }

    // "test" is a $1 charge that exists only to exercise the real payment path
    // end to end. Pricing.jsx hides it from non-admins, but hiding a button is
    // not a gate -- without this check anyone could POST planType:"test" and
    // buy the same access the $997 plan grants for a dollar.
    if (planType === "test" && user?.role !== "admin") {
      return res.status(403).json({ error: "Invalid plan type" });
    }

    const priceIds = {
      monthly: "price_1TlONtLiK3PoXkX5WStUc9On",
      yearly: "price_1TlONuLiK3PoXkX5lI4jLfip",
      lifetime: null,
    };

    if (["verified_veteran", "disabled_vet", "homeless_vet"].includes(user?.veteran_status)) {
      return res.status(200).json({ message: "Veteran discount applied - free access granted", veteranAccess: true });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const customerEmail = user?.email || email || "";
    const metadata = {
      app_id: "affiliate-pro-x",
      user_id: user?.id || "",
      user_email: customerEmail,
      plan_type: planType,
    };

    // One-time charges build their price inline; monthly/yearly use the
    // dashboard price ids above.
    const oneTimeAmounts = { lifetime: 99700, test: 100 };
    const oneTimeNames = {
      lifetime: "Affiliate Pro X - Lifetime Access",
      test: "Affiliate Pro X - Payment Test ($1)",
    };
    const isOneTime = planType === "lifetime" || planType === "test";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: isOneTime
        ? [{ price_data: { currency: "usd", product_data: { name: oneTimeNames[planType] }, unit_amount: oneTimeAmounts[planType] }, quantity: 1 }]
        : [{ price: priceIds[planType], quantity: 1 }],
      mode: isOneTime ? "payment" : "subscription",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(isOneTime ? { payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
    });

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: error.message });
  }
}
