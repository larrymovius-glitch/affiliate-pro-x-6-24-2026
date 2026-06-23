import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const { payoutId, veteranEmail, amount } = await req.json();

    // Validate payout
    if (!payoutId || !veteranEmail || !amount || amount <= 0) {
      return Response.json({ error: 'Invalid payout data' }, { status: 400 });
    }

    // Check available balance
    const allLinks = await db.entities.AffiliateLink.list();
    const totalEarned = allLinks.reduce((sum, l) => sum + (l.earnings || 0), 0);
    
    const existingPayouts = await db.entities.Payout.list();
    const totalPaid = existingPayouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const availableBalance = totalEarned - totalPaid;
    
    if (amount > availableBalance) {
      return Response.json({ 
        error: 'Insufficient balance',
        available: availableBalance,
        requested: amount 
      }, { status: 400 });
    }

    // Create Stripe transfer (requires Stripe Connect setup)
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      destination: veteranEmail, // This would be a connected account ID in production
      transfer_group: `payout_${payoutId}`,
    });

    // Update payout record
    await db.entities.Payout.update(payoutId, {
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: 'stripe',
      transaction_id: transfer.id
    });

    return Response.json({ 
      success: true,
      transfer_id: transfer.id,
      amount: amount 
    });
  } catch (error) {
    console.error('Payout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});