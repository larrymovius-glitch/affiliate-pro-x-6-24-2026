import { getAuthedUser } from "./_lib/supabase.js";
import { paypalFetch } from "./_lib/paypal.js";
import { db } from "./_lib/db.js";

// PayPal checkout currently only covers one-time plans. Monthly/Yearly stay
// Stripe-only until PayPal subscriptions are built.
//
// "test" is a $1 charge that exists only to exercise the real payment path end
// to end. It's admin-only and enforced below, not just hidden in the UI.
const PAYPAL_PLANS = {
  lifetime: { price: "997.00", description: "Affiliate Pro X - Lifetime Access" },
  test: { price: "1.00", description: "Affiliate Pro X - Payment Test ($1)" },
};

export default async function handler(req, res) {
  try {
    if (!process.env.VITE_PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.error("PayPal checkout error: PayPal credentials not configured");
      return res.status(500).json({ error: "Payment configuration is incomplete" });
    }

    const { user } = await getAuthedUser(req);
    const { planType } = req.body || {};

    const plan = PAYPAL_PLANS[planType];
    if (!plan) {
      return res.status(400).json({ error: "PayPal checkout is currently available for the Lifetime plan only" });
    }

    // Hiding the button in Pricing.jsx is not a gate -- without this anyone
    // could POST planType:"test" and buy full access for a dollar.
    if (planType === "test" && user?.role !== "admin") {
      return res.status(403).json({ error: "PayPal checkout is currently available for the Lifetime plan only" });
    }

    if (["verified_veteran", "disabled_vet", "homeless_vet"].includes(user?.veteran_status)) {
      return res.status(200).json({ message: "Veteran discount applied - free access granted", veteranAccess: true });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const order = await paypalFetch("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: user?.id || "",
            description: plan.description,
            amount: { currency_code: "USD", value: plan.price },
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
        amount: Number(plan.price),
        currency: "usd",
        status: "pending",
        payment_method: "paypal",
        transaction_id: order.id,
        plan_type: planType,
        veteran_status: "regular",
        description: `${plan.description} - checkout started`,
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
