import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const { planType, veteranStatus } = await req.json();

    // Validate plan type
    const validPlans = ['monthly', 'yearly', 'lifetime'];
    if (!validPlans.includes(planType)) {
      return Response.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    // Map plan types to price IDs (you'll configure these in Stripe Dashboard)
    const priceIds = {
      monthly: 'price_monthly_plan',
      yearly: 'price_yearly_plan',
      lifetime: 'price_lifetime_plan'
    };

    // Veterans get free access - skip checkout
    if (veteranStatus === 'verified') {
      return Response.json({ 
        message: 'Veteran discount applied - free access granted',
        veteranAccess: true 
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceIds[planType],
        quantity: 1,
      }],
      mode: planType === 'lifetime' ? 'payment' : 'subscription',
      success_url: `${Deno.env.get("BASE44_APP_URL")}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${Deno.env.get("BASE44_APP_URL")}/pricing?canceled=true`,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        user_id: user.id,
        user_email: user.email,
        plan_type: planType
      },
      customer_email: user.email,
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});