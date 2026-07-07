import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin or scheduled-run only (closes the unauthenticated service-role bypass)
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

    if (user?.role !== 'admin' && !cronOk) {
      return Response.json({ error: 'Forbidden: Admin access or scheduled run required' }, { status: 403 });
    }

    const db = base44.asServiceRole;

    // Load active payout schedules
    const schedules = await db.entities.PayoutSchedule.filter({ is_active: true });

    if (!schedules || schedules.length === 0) {
      return Response.json({ message: 'No active payout schedules found', processed: 0 });
    }

    const results = [];

    for (const schedule of schedules) {
      const now = new Date();

      // Check if it's time to process based on frequency
      const lastProcessed = schedule.last_processed_at ? new Date(schedule.last_processed_at) : null;
      let shouldProcess = false;

      if (!lastProcessed) {
        shouldProcess = true;
      } else {
        const diffMs = now - lastProcessed;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        const thresholds = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
        shouldProcess = diffDays >= (thresholds[schedule.frequency] || 7);
      }

      if (!shouldProcess) {
        results.push({ schedule_id: schedule.id, skipped: true, reason: 'Not yet due' });
        continue;
      }

      // Calculate next payout date
      const nextDates = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + (nextDates[schedule.frequency] || 7));

      // Update the schedule's last processed timestamp and next payout date
      await db.entities.PayoutSchedule.update(schedule.id, {
        last_processed_at: now.toISOString(),
        next_payout_date: nextDate.toISOString().split('T')[0],
      });

      results.push({
        schedule_id: schedule.id,
        processed: true,
        frequency: schedule.frequency,
        minimum_amount: schedule.minimum_amount,
        payment_method: schedule.payment_method,
        payment_email: schedule.payment_email,
        next_payout_date: nextDate.toISOString().split('T')[0],
        timestamp: now.toISOString(),
      });
    }

    return Response.json({
      message: 'Auto-payout run complete',
      processed: results.filter(r => r.processed).length,
      skipped: results.filter(r => r.skipped).length,
      results,
    });
  } catch (error) {
    console.error('processAutoPayouts failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});