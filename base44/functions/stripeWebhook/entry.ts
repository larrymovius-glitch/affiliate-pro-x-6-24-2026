import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });
    const signature = req.headers.get('stripe-signature');

    // Verify webhook signature
    let event;
    try {
      const body = await req.text();
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        Deno.env.get("STRIPE_WEBHOOK_SECRET")
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

        // Record the transaction
        await db.entities.Payment.create({
          user_id: session.metadata?.user_id,
          amount: session.amount_total / 100, // Convert from cents
          currency: session.currency,
          status: 'completed',
          payment_method: 'stripe',
          transaction_id: session.id,
          plan_type: session.metadata?.plan_type,
          veteran_status: 'regular'
        });

        console.log('Payment recorded:', session.id);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        
        // Update user subscription status
        if (subscription.metadata?.user_id) {
          // You could create a Subscription entity to track active subscriptions
          console.log('Subscription updated:', subscription.id);
        }
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