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

    const validPlans = ["monthly", "yearly", "lifetime"];
    if (!validPlans.includes(planType)) {
      return res.status(400).json({ error: "Invalid plan type" });
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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items:
        planType === "lifetime"
          ? [{ price_data: { currency: "usd", product_data: { name: "Affiliate Pro X - Lifetime Access" }, unit_amount: 99700 }, quantity: 1 }]
          : [{ price: priceIds[planType], quantity: 1 }],
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
