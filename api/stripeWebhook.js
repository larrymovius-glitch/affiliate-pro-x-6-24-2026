import Stripe from "stripe";
import { db } from "./_lib/db.js";
import { subscriptionTablePlanType } from "./_lib/testSubscription.js";

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
// Every paid plan (monthly, yearly, lifetime, test_subscription) maps to
// "pro" -- there is no separate lifetime tier value, lifetime is
// distinguished by its Payment row.
export const PAID_TIER = "pro";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const DEAD_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);
// Matches the lifetime price in src/lib/pricingPlans.js ("$997") and the
// amount api/createStripeCheckout.js actually charges for it (99700 cents).
const LIFETIME_PRICE = 997;

/**
 * Subscription payments count toward lifetime: once a user's completed
 * payments add up to the lifetime price, they've effectively paid for it
 * through monthly/yearly billing -- grant lifetime and stop charging them
 * further, rather than taking their money forever.
 *
 * Idempotent via a synthetic Payment row (transaction_id
 * "lifetime-earned:<userId>", amount 0 -- it marks the milestone, it isn't
 * a new charge) so a webhook retry can't grant it twice or cancel an
 * already-canceled subscription. That marker row is also what
 * downgradeIfEligible already checks for, so canceling the subscription
 * here safely triggers a later customer.subscription.deleted event without
 * downgrading them back to free.
 */
export async function grantLifetimeIfEarned(D, stripe, userId) {
  if (!userId) return;

  const alreadyLifetime = await D.Payment.filter({ user_id: userId, plan_type: "lifetime", status: "completed" });
  if (alreadyLifetime.length > 0) return;

  const payments = await D.Payment.filter({ user_id: userId, status: "completed" });
  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  if (total < LIFETIME_PRICE) return;

  const marker = `lifetime-earned:${userId}`;
  const existingMarker = await D.Payment.filter({ transaction_id: marker });
  if (existingMarker.length > 0) return;

  await D.Payment.create({
    user_id: userId,
    amount: 0,
    currency: "usd",
    status: "completed",
    payment_method: "stripe",
    transaction_id: marker,
    plan_type: "lifetime",
    description: `Lifetime access earned after $${total.toFixed(2)} in subscription payments`,
  });

  await D.User.update(userId, { subscription_tier: PAID_TIER });

  const activeSubs = await D.Subscription.filter({ user_id: userId, status: "active" });
  for (const sub of activeSubs) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      // Not fatal -- they've already earned lifetime (the Payment row above
      // is what actually grants it); worst case they're billed one more
      // cycle and downgradeIfEligible protects them from ever losing access
      // for it once that cycle's customer.subscription.deleted arrives.
      console.error("Failed to cancel subscription after lifetime earned:", err.message);
    }
  }
}

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

// A webhook destination sends events in the Stripe API version it was
// created with -- not the apiVersion pinned below -- and version 2025-03-31
// ("basil") moved two fields this file reads. Accept both shapes, or
// renewals silently stop being recorded. See tests/stripe-webhook-shapes.test.mjs.
export function invoiceSubscriptionId(invoice) {
  return invoice.subscription || invoice.parent?.subscription_details?.subscription || null;
}

export function subscriptionPeriod(subscription) {
  const item = subscription.items?.data?.[0];
  const start = subscription.current_period_start ?? item?.current_period_start;
  const end = subscription.current_period_end ?? item?.current_period_end;
  return {
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
  };
}

/**
 * Writes a subscription's current state to the subscriptions table and
 * returns the subscription it wrote.
 *
 * Stripe sends customer.subscription.created and .updated within the same
 * second, in no guaranteed order, so two webhook runs can race: both find no
 * row and both insert, and the loser hits the unique constraint on
 * stripe_subscription_id (a 500 on the first real purchase) -- or an older
 * snapshot lands last and overwrites a newer one. So this reads the live
 * subscription from Stripe instead of trusting the event's copy, and turns a
 * lost insert race into an update. See tests/stripe-subscription-sync.test.mjs.
 */
export async function syncSubscription(D, stripe, eventSubscription) {
  let subscription = eventSubscription;
  try {
    subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
  } catch (err) {
    console.error("Could not fetch live subscription, using the event's copy:", eventSubscription.id, err.message);
  }

  const record = {
    user_id: subscription.metadata?.user_id || "",
    user_email: subscription.metadata?.user_email || "",
    stripe_subscription_id: subscription.id,
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : "",
    // The subscriptions table only accepts monthly | yearly | lifetime; see
    // subscriptionTablePlanType for why the $1 test is stored as monthly.
    plan_type: subscriptionTablePlanType(subscription.metadata?.plan_type),
    status: subscription.status,
    ...subscriptionPeriod(subscription),
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
  };

  const [existing] = await D.Subscription.filter({ stripe_subscription_id: subscription.id });
  if (existing) {
    await D.Subscription.update(existing.id, record);
    return subscription;
  }

  try {
    await D.Subscription.create(record);
  } catch (err) {
    if (err?.code !== "23505") throw err;
    const [insertedMeanwhile] = await D.Subscription.filter({ stripe_subscription_id: subscription.id });
    await D.Subscription.update(insertedMeanwhile.id, record);
  }
  return subscription;
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
          await grantLifetimeIfEarned(D, stripe, session.metadata.user_id);
        }

        console.log("Payment recorded:", session.id);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const eventSubscription = event.data.object;
        if (eventSubscription.metadata?.app_id !== APP_ID) return res.status(200).json({ message: "Ignored - different app" });

        const subscription = await syncSubscription(D, stripe, eventSubscription);

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
        const invoiceSubId = invoiceSubscriptionId(invoice);
        if (invoiceSubId && invoice.billing_reason === "subscription_cycle") {
          const subscription = await stripe.subscriptions.retrieve(invoiceSubId);
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
          if (subscription.metadata?.user_id) {
            await grantLifetimeIfEarned(D, stripe, subscription.metadata.user_id);
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
