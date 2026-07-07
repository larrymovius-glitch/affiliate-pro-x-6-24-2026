import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: '2023-10-16' });
    const db = base44.asServiceRole;
    const { payoutId, veteranEmail } = await req.json();

    if (!payoutId) {
      return Response.json({ error: 'Invalid payout data' }, { status: 400 });
    }

    // Load the payout record — amount and recipient are derived from the approved
    // record, never from the request body.
    let payoutRecord = null;
    try { payoutRecord = await db.entities.Payout.get(payoutId); } catch (_) { payoutRecord = null; }
    if (!payoutRecord) {
      return Response.json({ error: 'Payout not found' }, { status: 404 });
    }
    if (payoutRecord.status !== 'approved') {
      return Response.json({ error: `Payout is not approved (status: ${payoutRecord.status})` }, { status: 400 });
    }
    const amount = payoutRecord.amount;
    if (!amount || amount <= 0) {
      return Response.json({ error: 'Invalid payout amount on record' }, { status: 400 });
    }

    // Recipient is the payout's creator
    const recipient = await db.entities.User.get(payoutRecord.created_by_id);
    if (!recipient) {
      return Response.json({ error: 'Recipient user not found' }, { status: 404 });
    }
    // Cross-check the email supplied by the admin UI against the record
    if (veteranEmail && recipient.email !== veteranEmail) {
      return Response.json({ error: 'Recipient email does not match the payout record' }, { status: 400 });
    }
    if (!recipient.stripeAccountId || !String(recipient.stripeAccountId).startsWith('acct_')) {
      return Response.json({
        error: 'Recipient has no connected Stripe account. They must complete Stripe Connect onboarding and save their account via payment settings first.'
      }, { status: 400 });
    }

    // Check available balance — scoped to the recipient only
    const recipientLinks = await db.entities.AffiliateLink.filter({ created_by_id: recipient.id });
    const totalEarned = recipientLinks.reduce((sum, l) => sum + (l.earnings || 0), 0);

    const recipientPayouts = await db.entities.Payout.filter({ created_by_id: recipient.id });
    const totalPaid = recipientPayouts
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

    // Transfer to the recipient's Stripe connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: recipient.stripeAccountId,
      transfer_group: `payout_${payoutId}`,
    });

    // Update payout record
    await db.entities.Payout.update(payoutId, {
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: 'bank_transfer',
      notes: `Stripe transfer ${transfer.id}`
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