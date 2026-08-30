import Stripe from "stripe";
import { db } from "./_lib/db.js";

// Stripe needs the raw request body to verify signatures, so this route
// must NOT use Vercel's automatic JSON body parsing.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// profiles.subscription_tier allows exactly: free | pro | veteran_free.
// Every paid plan (monthly, yearly, lifetime) maps to "pro" -- there is no
// separate lifetime tier value, lifetime is distinguished by its Payment row.
const PAID_TIER = "pro";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const DEAD_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

/**
 * Drop a user back to the free tier, but only when that's actually correct.
 * Two groups must never be downgraded by a lapsed subscription:
 *   - verified veterans, whose free access is permanent by design
 *   - anyone holding a completed one-time lifetime purchase, which outlives
 *     any subscription they may also have had
 */
export async function downgradeIfEligible(D, userId) {
  if (!userId) return;
  const [profile] = await D.User.filter({ id: userId });
  if (!profile || profile.subscription_tier === "veteran_free") return;

  const lifetime = await D.Payment.filter({ user_id: userId, plan_type: "lifetime", status: "completed" });
  if (lifetime.length > 0) return;

  await D.User.update(userId, { subscription_tier: "free" });
}

export default async function handler(req, res) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeKey || !webhookSecret) {
      console.error("Stripe webhook misconfigured");
      return res.status(500).json({ error: "Server misconfiguration" });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing signature" });

    const rawBody = await readRawBody(req);
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: "Invalid signature" });
    }

    const D = db();
    const APP_ID = "affiliate-pro-x";

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.metadata?.app_id !== APP_ID) return res.status(200).json({ message: "Ignored - different app" });

        const existing = await D.Payment.filter({ transaction_id: session.id });
        if (existing.length === 0) {
          await D.Payment.create({
            user_id: session.metadata?.user_id,
            amount: session.amount_total / 100,
            currency: session.currency,
            status: "completed",
            payment_method: "stripe",
            transaction_id: session.id,
            plan_type: session.metadata?.plan_type,
            veteran_status: "regular",
          });
        }

        // The link that was missing entirely: without this, a customer could
        // pay in full and the app would still treat them as a free user,
        // because nothing else anywhere writes subscription_tier.
        if (session.metadata?.user_id) {
          await D.User.update(session.metadata.user_id, { subscription_tier: PAID_TIER });
        }

        console.log("Payment recorded:", session.id);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        if (subscription.metadata?.app_id !== APP_ID) return res.status(200).json({ message: "Ignored - different app" });

        const record = {
          user_id: subscription.metadata?.user_id || "",
          user_email: subscription.metadata?.user_email || "",
          stripe_subscription_id: subscription.id,
          stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : "",
          plan_type: subscription.metadata?.plan_type,
          status: subscription.status,
          current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
          current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
          canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        };

        const existing = await D.Subscription.filter({ stripe_subscription_id: subscription.id });
        if (existing.length > 0) await D.Subscription.update(existing[0].id, record);
        else await D.Subscription.create(record);

        // Keep the user's tier in step with the subscription's real state.
        // Deliberately no branch for "incomplete"/"past_due": those are
        // in-flight states (authentication pending, retrying a failed
        // charge) where Stripe has not given up yet, so neither granting nor
        // revoking access is the right call until it resolves either way.
        const subUserId = subscription.metadata?.user_id;
        if (subUserId && ACTIVE_STATUSES.has(subscription.status)) {
          await D.User.update(subUserId, { subscription_tier: PAID_TIER });
        } else if (subUserId && DEAD_STATUSES.has(subscription.status)) {
          await downgradeIfEligible(D, subUserId);
        }

        console.log("Subscription synced:", subscription.id, subscription.status);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        if (paymentIntent.metadata?.app_id !== APP_ID) return res.status(200).json({ message: "Ignored - different app" });
        console.log("Payment succeeded:", paymentIntent.id);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.subscription && invoice.billing_reason === "subscription_cycle") {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          if (subscription.metadata?.app_id !== APP_ID) return res.status(200).json({ message: "Ignored - different app" });

          const existingRenewal = await D.Payment.filter({ transaction_id: invoice.id });
          if (existingRenewal.length === 0) {
            await D.Payment.create({
              user_id: subscription.metadata?.user_id,
              amount: invoice.amount_paid / 100,
              currency: invoice.currency,
              status: "completed",
              payment_method: "stripe",
              transaction_id: invoice.id,
              plan_type: subscription.metadata?.plan_type,
              // `description`, not `notes` -- the live payments table has no
              // `notes` column (base44/entities/Payment.jsonc names it that,
              // but the table that actually exists uses `description`), so
              // this insert rejected every renewal outright.
              description: "Subscription renewal",
            });
          }
          console.log("Renewal payment recorded:", invoice.id);
        }
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: error.message });
  }
}
