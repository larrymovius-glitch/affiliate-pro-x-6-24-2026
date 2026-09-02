import { getAuthedUser } from "./_lib/supabase.js";
import { paypalFetch } from "./_lib/paypal.js";
import { db } from "./_lib/db.js";
import { PAID_TIER } from "./stripeWebhook.js";

// Called from the /payment-success page once PayPal redirects the buyer
// back with ?token=<orderId>. Orders API v2 requires an explicit capture
// after approval - unlike Stripe Checkout, approval alone doesn't take payment.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user?.id) return res.status(401).json({ error: "You must be signed in to complete this payment" });

    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "Missing PayPal order ID" });

    const D = db();

    const existing = await D.Payment.filter({ transaction_id: orderId });
    if (existing.length > 0) {
      return res.status(200).json({ status: "completed" });
    }

    const capture = await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, { method: "POST" });

    if (capture.status !== "COMPLETED") {
      console.error("PayPal capture not completed:", orderId, capture.status);
      return res.status(400).json({ error: "PayPal payment was not completed" });
    }

    const captureUnit = capture.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = captureUnit?.amount?.value ? Number(captureUnit.amount.value) : 997;
    const currency = (captureUnit?.amount?.currency_code || "USD").toLowerCase();

    await D.Payment.create({
      user_id: user.id,
      amount,
      currency,
      status: "completed",
      payment_method: "paypal",
      transaction_id: orderId,
      plan_type: "lifetime",
      veteran_status: "regular",
    });

    // Same link Stripe's checkout.session.completed makes - without this,
    // the customer has paid but nothing anywhere lifts them off the free tier.
    await D.User.update(user.id, { subscription_tier: PAID_TIER });

    console.log("PayPal payment recorded:", orderId);
    res.status(200).json({ status: "completed" });
  } catch (error) {
    console.error("PayPal capture error:", error);
    res.status(500).json({ error: error.message });
  }
}
