import { getAuthedUser } from "./_lib/supabase.js";
import { paypalFetch } from "./_lib/paypal.js";
import { db } from "./_lib/db.js";
import { activatePaypalSubscription } from "./_lib/paypalSubscriptions.js";

// Called from /payment-success once PayPal redirects the buyer back with
// ?subscription_id=<id>. This route grants access the moment PayPal confirms
// the subscription is ACTIVE, so the buyer doesn't sit on a spinner waiting
// for a webhook that may take a few seconds to arrive. It does not record a
// charge amount -- see _lib/paypalSubscriptions.js for why that's left
// solely to paypalWebhook.js's PAYMENT.SALE.COMPLETED handler.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user?.id) return res.status(401).json({ error: "You must be signed in to complete this payment" });

    const { subscriptionId } = req.body || {};
    if (!subscriptionId) return res.status(400).json({ error: "Missing PayPal subscription ID" });

    const D = db();

    const existing = await D.Payment.filter({ transaction_id: subscriptionId });
    const checkoutRow = existing[0];
    // A subscription we have on file belongs to whoever started it -- without
    // this, someone could pass another buyer's subscription id and have the
    // resulting tier granted to their own account instead.
    if (checkoutRow?.user_id && checkoutRow.user_id !== user.id) {
      return res.status(403).json({ error: "That subscription belongs to a different account" });
    }

    const subscription = await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}`);

    if (subscription.status !== "ACTIVE") {
      // Not necessarily an error -- PayPal can take a moment after approval.
      // paypalWebhook.js's ACTIVATED handler will finish the job once it fires.
      return res.status(200).json({ status: "pending" });
    }

    await activatePaypalSubscription(D, {
      subscriptionId,
      userId: user.id,
      planType: checkoutRow?.plan_type,
    });

    console.log("PayPal subscription activated:", subscriptionId);
    res.status(200).json({ status: "completed" });
  } catch (error) {
    console.error("PayPal subscription capture error:", error);
    res.status(500).json({ error: error.message });
  }
}
