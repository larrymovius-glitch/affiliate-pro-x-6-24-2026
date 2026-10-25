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

    // createPaypalOrder now writes a `pending` row up front, so "a row exists"
    // no longer means "already paid" -- only a completed one does. Checking for
    // any row here would short-circuit before capturing and leave every order
    // approved-but-never-charged.
    const existing = await D.Payment.filter({ transaction_id: orderId });
    if (existing.some((p) => p.status === "completed")) {
      return res.status(200).json({ status: "completed" });
    }

    const pending = existing.find((p) => p.status === "pending");
    // An order we have on file belongs to whoever started it. Without this,
    // someone could pass another buyer's order id and have the resulting tier
    // granted to their own account instead.
    if (pending && pending.user_id && pending.user_id !== user.id) {
      return res.status(403).json({ error: "That payment belongs to a different account" });
    }

    const capture = await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, { method: "POST" });

    if (capture.status !== "COMPLETED") {
      console.error("PayPal capture not completed:", orderId, capture.status);
      return res.status(400).json({ error: "PayPal payment was not completed" });
    }

    const captureUnit = capture.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = captureUnit?.amount?.value ? Number(captureUnit.amount.value) : 997;
    const currency = (captureUnit?.amount?.currency_code || "USD").toLowerCase();

    if (pending) {
      await D.Payment.update(pending.id, {
        amount,
        currency,
        status: "completed",
        description: "PayPal payment captured",
      });
    } else {
      // No pending row: an order started before createPaypalOrder recorded one.
      await D.Payment.create({
        user_id: user.id,
        amount,
        currency,
        status: "completed",
        payment_method: "paypal",
        transaction_id: orderId,
        plan_type: "lifetime",
        veteran_status: "regular",
        description: "PayPal payment captured",
      });
    }

    // Same link Stripe's checkout.session.completed makes - without this,
    // the customer has paid but nothing anywhere lifts them off the free tier.
    await D.User.update(user.id, { subscription_tier: PAID_TIER });

    console.log("PayPal payment recorded:", orderId);
    res.status(200).json({ status: "completed" });
  } catch (error) {
    console.error("PayPal capture error:", error);
    // reconcilePaypalPayments may have captured this order first, in which case
    // PayPal rejects the second capture. The buyer has paid and been granted
    // their tier, so don't show them a payment-failed page over it.
    try {
      const { orderId } = req.body || {};
      if (orderId) {
        const settled = await db().Payment.filter({ transaction_id: orderId, status: "completed" });
        if (settled.length > 0) return res.status(200).json({ status: "completed" });
      }
    } catch {
      // fall through to the error below
    }
    res.status(500).json({ error: error.message });
  }
}
