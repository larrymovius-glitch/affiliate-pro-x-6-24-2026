import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { stripeAccountId, email } = await req.json();

    if (!stripeAccountId || !email) {
      return Response.json({ 
        error: 'Missing required fields',
        required: ['stripeAccountId', 'email']
      }, { status: 400 });
    }

    // Validate Stripe account ID format
    if (!stripeAccountId.startsWith('acct_')) {
      return Response.json({ 
        error: 'Invalid Stripe account ID format. Should start with "acct_"'
      }, { status: 400 });
    }

    // Update user with payment info
    await base44.entities.User.update(user.id, {
      stripeAccountId,
      paymentEmail: email,
      payoutReady: true
    });

    // Create or update payout schedule
    const existingSchedule = await base44.entities.PayoutSchedule.filter({});
    
    if (existingSchedule.length === 0) {
      await base44.entities.PayoutSchedule.create({
        is_active: true,
        frequency: "weekly",
        minimum_amount: 25,
        payment_method: "bank_transfer",
        payment_email: email,
        notes: `Auto-configured for user ${user.email}`
      });
    }

    return Response.json({ 
      success: true,
      message: 'Payment info saved! You will receive commissions automatically.',
      payoutReady: true
    });

  } catch (error) {
    console.error('Payment info error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});