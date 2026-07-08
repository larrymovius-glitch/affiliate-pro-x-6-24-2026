import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const CRON_TOKEN = Deno.env.get("CRON_SECRET");
    if (!CRON_TOKEN) {
      console.error("CRON_SECRET not configured");
      return Response.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    let payload = {};
    try { payload = await req.json(); } catch (_) { payload = {}; }
    const cronOk = payload.cron_secret === CRON_TOKEN || req.headers.get('x-cron-secret') === CRON_TOKEN;

    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }

    const selfOnly = payload.self_only === true && !!user;
    if (user?.role !== 'admin' && !cronOk && !selfOnly) {
      return Response.json({ error: 'Forbidden: Admin access, scheduled run, or self-run required' }, { status: 403 });
    }

    const db = base44.asServiceRole;
    const schedules = selfOnly
      ? await db.entities.PayoutSchedule.filter({ is_active: true, created_by_id: user.id })
      : await db.entities.PayoutSchedule.filter({ is_active: true });

    if (!schedules || schedules.length === 0) {
      return Response.json({ message: 'No active payout schedules found', processed: 0, created: 0 });
    }

    const results = [];

    for (const schedule of schedules) {
      const now = new Date();
      const ownerId = schedule.created_by_id;

      const lastProcessed = schedule.last_processed_at ? new Date(schedule.last_processed_at) : null;
      let shouldProcess = !lastProcessed;

      if (lastProcessed) {
        const diffMs = now - lastProcessed;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        const thresholds = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
        shouldProcess = diffDays >= (thresholds[schedule.frequency] || 7);
      }

      const nextDates = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + (nextDates[schedule.frequency] || 7));

      if (!shouldProcess) {
        results.push({ schedule_id: schedule.id, skipped: true, reason: 'Not yet due' });
        continue;
      }

      if (!ownerId) {
        results.push({ schedule_id: schedule.id, skipped: true, reason: 'Missing owner' });
        continue;
      }

      const links = await db.entities.AffiliateLink.filter({ created_by_id: ownerId });
      const totalEarned = links.reduce((sum, link) => sum + (link.earnings || 0), 0);

      const payouts = await db.entities.Payout.filter({ created_by_id: ownerId });
      const reserved = payouts
        .filter(payout => ['pending', 'approved', 'paid'].includes(payout.status))
        .reduce((sum, payout) => sum + (payout.amount || 0), 0);

      const availableBalance = Math.max(0, totalEarned - reserved);
      const minimumAmount = schedule.minimum_amount || 25;
      let createdPayout = null;

      if (availableBalance >= minimumAmount) {
        createdPayout = await db.entities.Payout.create({
          created_by_id: ownerId,
          user_id: ownerId,
          amount: Number(availableBalance.toFixed(2)),
          status: 'pending',
          payment_method: schedule.payment_method || 'paypal',
          payment_email: schedule.payment_email || '',
          source: 'auto',
          requested_at: now.toISOString(),
          notes: `Auto-payout created from ${schedule.frequency || 'weekly'} schedule.`
        });
      }

      await db.entities.PayoutSchedule.update(schedule.id, {
        last_processed_at: now.toISOString(),
        next_payout_date: nextDate.toISOString().split('T')[0],
        notes: createdPayout
          ? `Created payout $${Number(availableBalance.toFixed(2))} on ${now.toISOString()}`
          : `Checked balance $${availableBalance.toFixed(2)} on ${now.toISOString()}; minimum is $${minimumAmount}`
      });

      results.push({
        schedule_id: schedule.id,
        processed: true,
        payout_created: !!createdPayout,
        payout_id: createdPayout?.id || null,
        available_balance: Number(availableBalance.toFixed(2)),
        minimum_amount: minimumAmount,
        next_payout_date: nextDate.toISOString().split('T')[0]
      });
    }

    return Response.json({
      message: 'Auto-payout run complete',
      processed: results.filter(r => r.processed).length,
      created: results.filter(r => r.payout_created).length,
      skipped: results.filter(r => r.skipped).length,
      results,
    });
  } catch (error) {
    console.error('processAutoPayouts failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});