import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error('Stripe checkout error: STRIPE_SECRET_KEY not configured');
      return Response.json({ error: 'Payment configuration is incomplete' }, { status: 500 });
    }

    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }

    const { planType, email } = await req.json();

    const validPlans = ['monthly', 'yearly', 'lifetime'];
    if (!validPlans.includes(planType)) {
      return Response.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    const priceIds = {
      monthly: 'price_1TlONtLiK3PoXkX5WStUc9On',
      yearly: 'price_1TlONuLiK3PoXkX5lI4jLfip',
      lifetime: null
    };

    if (['verified_veteran', 'disabled_vet', 'homeless_vet'].includes(user?.veteran_status)) {
      return Response.json({
        message: 'Veteran discount applied - free access granted',
        veteranAccess: true
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const origin = req.headers.get('origin') || new URL(req.url).origin;
    const customerEmail = user?.email || email || '';
    const metadata = {
      base44_app_id: Deno.env.get("BASE44_APP_ID") || '',
      user_id: user?.id || '',
      user_email: customerEmail,
      plan_type: planType
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: planType === 'lifetime' ? [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Affiliate Pro X - Lifetime Access' },
          unit_amount: 99700
        },
        quantity: 1
      }] : [{
        price: priceIds[planType],
        quantity: 1,
      }],
      mode: planType === 'lifetime' ? 'payment' : 'subscription',
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(planType === 'lifetime'
        ? { payment_intent_data: { metadata } }
        : { subscription_data: { metadata } }),
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});