import Stripe from "stripe";
import { db } from "./_lib/db.js";
import { verifyPaypalWebhookSignature, cancelPaypalSubscription } from "./_lib/paypal.js";
import { activatePaypalSubscription, recordPaypalSubscriptionCharge } from "./_lib/paypalSubscriptions.js";
import { grantLifetimeIfEarned, downgradeIfEligible } from "./stripeWebhook.js";

// The durable side of PayPal subscriptions -- unlike the /payment-success
// redirect (capturePaypalSubscription.js), this fires even if the buyer
// closes their browser the instant they approve, and it's the only place
// that ever hears about a cancellation, suspension, or renewal after the
// fact. Requires a webhook subscribed once in the PayPal dashboard
// (Apps & Credentials > your app > Webhooks) pointed at
// https://<your-domain>/api/paypalWebhook, subscribed to at least:
// BILLING.SUBSCRIPTION.ACTIVATED, BILLING.SUBSCRIPTION.CANCELLED,
// BILLING.SUBSCRIPTION.SUSPENDED, BILLING.SUBSCRIPTION.EXPIRED, and
// PAYMENT.SALE.COMPLETED. Its Webhook ID goes in PAYPAL_WEBHOOK_ID.
const DEAD_STATES = new Set([
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
]);

export default async function handler(req, res) {
  try {
    if (!process.env.VITE_PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_WEBHOOK_ID) {
      console.error("PayPal webhook misconfigured");
      return res.status(500).json({ error: "Server misconfiguration" });
    }

    const event = req.body;
    let verified;
    try {
      verified = await verifyPaypalWebhookSignature(req.headers, event);
    } catch (err) {
      console.error("PayPal webhook verification request failed:", err.message);
      return res.status(400).json({ error: "Could not verify webhook signature" });
    }
    if (!verified) {
      console.error("PayPal webhook signature verification failed for event:", event?.id);
      return res.status(400).json({ error: "Invalid signature" });
    }

    const D = db();
    const resource = event.resource || {};

    switch (event.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        await activatePaypalSubscription(D, {
          subscriptionId: resource.id,
          userId: resource.custom_id || null,
          planType: null, // resolved from the checkout row activatePaypalSubscription looks up
        });
        console.log("PayPal subscription activated (webhook):", resource.id);
        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        const subscriptionId = resource.billing_agreement_id;
        if (!subscriptionId) break; // a one-time sale, not a subscription charge -- not this flow

        // The sale event carries no user_id or plan_type of its own; both
        // live on the checkout row this subscription's own creation wrote.
        const [checkoutRow] = await D.Payment.filter({ transaction_id: subscriptionId });
        const userId = checkoutRow?.user_id || null;
        const planType = checkoutRow?.plan_type || "monthly";

        const outcome = await recordPaypalSubscriptionCharge(D, {
          saleId: resource.id,
          subscriptionId,
          userId,
          planType,
          amount: resource.amount?.total ? Number(resource.amount.total) : 0,
          currency: (resource.amount?.currency || "USD").toLowerCase(),
        });

        if (outcome === "recorded" && userId) {
          const stripeKey = process.env.STRIPE_SECRET_KEY;
          // grantLifetimeIfEarned cancels any Stripe subscription it finds for
          // this user once they've paid enough across all methods combined --
          // real even for a PayPal-only payer who separately still has an old
          // Stripe one. It never touches PayPal subscriptions itself, so this
          // subscription is canceled explicitly right after, same intent.
          const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2023-10-16" }) : null;
          await grantLifetimeIfEarned(D, stripe, userId);
          try {
            const lifetimeRows = await D.Payment.filter({ user_id: userId, plan_type: "lifetime", status: "completed" });
            if (lifetimeRows.length > 0) {
              await cancelPaypalSubscription(subscriptionId, "Lifetime access earned -- no further charges needed");
            }
          } catch (cancelError) {
            // Not fatal -- lifetime was already granted above (the Payment
            // row is what actually grants it); worst case this subscription
            // bills one more cycle and the next PAYMENT.SALE.COMPLETED tries
            // the cancel again.
            console.error("Failed to cancel PayPal subscription after lifetime earned:", subscriptionId, cancelError.message);
          }
        }

        console.log("PayPal subscription charge recorded:", resource.id, "outcome:", outcome);
        break;
      }

      default: {
        if (DEAD_STATES.has(event.event_type)) {
          const subscriptionId = resource.id;
          const [checkoutRow] = await D.Payment.filter({ transaction_id: subscriptionId });
          if (checkoutRow?.user_id) {
            await downgradeIfEligible(D, checkoutRow.user_id);
            console.log("PayPal subscription ended, downgrade evaluated:", subscriptionId, event.event_type);
          }
        } else {
          console.log("Unhandled PayPal webhook event type:", event.event_type);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("PayPal webhook error:", error);
    res.status(500).json({ error: error.message });
  }
}
