import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey || !webhookSecret) {
      console.error('Stripe webhook misconfigured');
      return Response.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return Response.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event;
    try {
      const body = await req.text();
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
        );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const db = base44.asServiceRole;

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Verify this is our app's transaction
        if (session.metadata?.base44_app_id !== Deno.env.get("BASE44_APP_ID")) {
          return Response.json({ message: 'Ignored - different app' });
        }

        // Record the transaction once, even if Stripe retries the webhook.
        const existingPayment = await db.entities.Payment.filter({ transaction_id: session.id });
        if (existingPayment.length === 0) {
          await db.entities.Payment.create({
            user_id: session.metadata?.user_id,
            amount: session.amount_total / 100,
            currency: session.currency,
            status: 'completed',
            payment_method: 'stripe',
            transaction_id: session.id,
            plan_type: session.metadata?.plan_type,
            veteran_status: 'regular'
          });
        }

        console.log('Payment recorded:', session.id);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        if (subscription.metadata?.base44_app_id !== Deno.env.get("BASE44_APP_ID")) {
          return Response.json({ message: 'Ignored - different app' });
        }

        const record = {
          user_id: subscription.metadata?.user_id || '',
          user_email: subscription.metadata?.user_email || '',
          stripe_subscription_id: subscription.id,
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : '',
          plan_type: subscription.metadata?.plan_type,
          status: subscription.status,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          canceled_at: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000).toISOString()
            : null,
        };

        const existing = await db.entities.Subscription.filter({ stripe_subscription_id: subscription.id });
        if (existing.length > 0) {
          await db.entities.Subscription.update(existing[0].id, record);
        } else {
          await db.entities.Subscription.create(record);
        }

        console.log('Subscription synced:', subscription.id, subscription.status);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        
        if (paymentIntent.metadata?.base44_app_id !== Deno.env.get("BASE44_APP_ID")) {
          return Response.json({ message: 'Ignored - different app' });
        }

        console.log('Payment succeeded:', paymentIntent.id);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;

        // Record subscription RENEWAL payments (the initial payment is recorded via checkout.session.completed)
        if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);

          if (subscription.metadata?.base44_app_id !== Deno.env.get("BASE44_APP_ID")) {
            return Response.json({ message: 'Ignored - different app' });
          }

          const existingRenewal = await db.entities.Payment.filter({ transaction_id: invoice.id });
          if (existingRenewal.length === 0) {
            await db.entities.Payment.create({
              user_id: subscription.metadata?.user_id,
              amount: invoice.amount_paid / 100,
              currency: invoice.currency,
              status: 'completed',
              payment_method: 'stripe',
              transaction_id: invoice.id,
              plan_type: subscription.metadata?.plan_type,
              notes: 'Subscription renewal'
            });
          }

          console.log('Renewal payment recorded:', invoice.id);
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});