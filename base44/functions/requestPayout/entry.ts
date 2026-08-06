import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function moneyToCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function centsToMoney(cents) {
  return Number(((Number(cents) || 0) / 100).toFixed(2));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { amount } = await req.json();
    const requestedCents = moneyToCents(amount);
    if (!requestedCents || requestedCents <= 0) {
      return Response.json({ error: 'Enter a payout amount greater than $0.' }, { status: 400 });
    }

    const db = base44.asServiceRole;
    const links = await db.entities.AffiliateLink.filter({ created_by_id: user.id });
    const totalEarnedCents = links.reduce((sum, link) => sum + moneyToCents(link.earnings), 0);

    const byCreator = await db.entities.Payout.filter({ created_by_id: user.id });
    const byUserId = await db.entities.Payout.filter({ user_id: user.id });
    const payoutMap = new Map([...byCreator, ...byUserId].map((payout) => [payout.id, payout]));
    const payouts = [...payoutMap.values()];

    const reservedCents = payouts
      .filter((payout) => ['pending', 'approved', 'paid'].includes(payout.status))
      .reduce((sum, payout) => sum + moneyToCents(payout.amount), 0);
    const availableCents = Math.max(0, totalEarnedCents - reservedCents);

    if (requestedCents > availableCents) {
      return Response.json({
        error: `Insufficient balance. Available: $${centsToMoney(availableCents).toFixed(2)}`,
        available: centsToMoney(availableCents),
        requested: centsToMoney(requestedCents)
      }, { status: 400 });
    }

    const payout = await db.entities.Payout.create({
      created_by_id: user.id,
      user_id: user.id,
      amount: centsToMoney(requestedCents),
      status: 'pending',
      source: 'manual',
      requested_at: new Date().toISOString(),
      notes: `User requested payout. Available balance at request: $${centsToMoney(availableCents).toFixed(2)}.`
    });

    return Response.json({ success: true, payout });
  } catch (error) {
    console.error('requestPayout failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});