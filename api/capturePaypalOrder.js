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

    // Confirm this order was created for *this* user before capturing it.
    // createPaypalOrder.js stamps the buyer's id into custom_id; without
    // checking it, whoever calls this endpoint gets credited, and the order id
    // is not a secret (PayPal puts it in the return URL as ?token=). Any
    // signed-in third party holding an approved order id could otherwise
    // capture it and take the upgrade, leaving the real payer with nothing but
    // the idempotency short-circuit above.
    const order = await paypalFetch(`/v2/checkout/orders/${orderId}`);
    const orderOwnerId = order.purchase_units?.[0]?.custom_id || "";
    if (orderOwnerId && orderOwnerId !== user.id) {
      console.error("PayPal order owner mismatch:", orderId, "expected", orderOwnerId);
      return res.status(403).json({ error: "This payment belongs to a different account" });
    }

    const capture = await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, { method: "POST" });

    if (capture.status !== "COMPLETED") {
      console.error("PayPal capture not completed:", orderId, capture.status);
      return res.status(400).json({ error: "PayPal payment was not completed" });
    }

    // Fall back to the order's own amount rather than a hardcoded 997, so a
    // recorded payment can never disagree with what PayPal actually charged.
    const captureUnit = capture.purchase_units?.[0]?.payments?.captures?.[0];
    const orderAmount = order.purchase_units?.[0]?.amount;
    const amountValue = captureUnit?.amount?.value ?? orderAmount?.value;
    const parsedAmount = amountValue != null ? Number(amountValue) : NaN;
    const amount = Number.isNaN(parsedAmount) ? null : parsedAmount;
    const currency = (captureUnit?.amount?.currency_code || orderAmount?.currency_code || "USD").toLowerCase();

    // Deliberately does not abort: PayPal has already taken the money by this
    // point, so bailing here would leave a paying customer with nothing. Record
    // the payment with a null amount and grant access; the null is the flag to
    // go reconcile it against PayPal by hand.
    if (amount == null) console.error("PayPal capture returned no usable amount:", orderId);

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
