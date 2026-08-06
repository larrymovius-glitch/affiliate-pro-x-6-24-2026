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
          current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
          canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        };

        const existing = await D.Subscription.filter({ stripe_subscription_id: subscription.id });
        if (existing.length > 0) await D.Subscription.update(existing[0].id, record);
        else await D.Subscription.create(record);

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
              notes: "Subscription renewal",
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
