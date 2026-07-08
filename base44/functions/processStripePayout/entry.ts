import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

function moneyToCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function centsToMoney(cents) {
  return Number(((Number(cents) || 0) / 100).toFixed(2));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error('STRIPE_SECRET_KEY not configured');
      return Response.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
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
    const amountCents = moneyToCents(payoutRecord.amount);
    if (!amountCents || amountCents <= 0) {
      return Response.json({ error: 'Invalid payout amount on record' }, { status: 400 });
    }
    const amount = centsToMoney(amountCents);

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
    const totalEarnedCents = recipientLinks.reduce((sum, l) => sum + moneyToCents(l.earnings), 0);

    const recipientPayouts = await db.entities.Payout.filter({ created_by_id: recipient.id });
    const reservedByOtherPayoutsCents = recipientPayouts
      .filter(p => p.id !== payoutId && ['pending', 'approved', 'paid'].includes(p.status))
      .reduce((sum, p) => sum + moneyToCents(p.amount), 0);

    const availableCents = totalEarnedCents - reservedByOtherPayoutsCents;

    if (amountCents > availableCents) {
      return Response.json({
        error: 'Insufficient balance',
        available: centsToMoney(availableCents),
        requested: amount
      }, { status: 400 });
    }

    // Transfer to the recipient's Stripe connected account
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: recipient.stripeAccountId,
      transfer_group: `payout_${payoutId}`,
      metadata: {
        payout_id: payoutId,
        recipient_user_id: recipient.id,
        base44_app_id: Deno.env.get("BASE44_APP_ID") || ''
      }
    }, { idempotencyKey: `payout_${payoutId}` });

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