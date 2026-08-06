import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";

function moneyToCents(v) { return Math.round((Number(v) || 0) * 100); }
function centsToMoney(c) { return Number(((Number(c) || 0) / 100).toFixed(2)); }

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    const selfOnly = body.self_only === true && !!user;

    if (user?.role !== "admin" && !cronOk && !selfOnly) {
      return res.status(403).json({ error: "Forbidden: Admin access, scheduled run, or self-run required" });
    }

    const D = db();
    const schedules = selfOnly
      ? await D.PayoutSchedule.filter({ is_active: true, created_by_id: user.id })
      : await D.PayoutSchedule.filter({ is_active: true });

    if (!schedules.length) {
      return res.status(200).json({ message: "No active payout schedules found", processed: 0, created: 0 });
    }

    const results = [];
    for (const schedule of schedules) {
      const now = new Date();
      const ownerId = schedule.created_by_id;
      const lastProcessed = schedule.last_processed_at ? new Date(schedule.last_processed_at) : null;
      let shouldProcess = !lastProcessed;

      if (lastProcessed) {
        const diffDays = (now - lastProcessed) / (1000 * 60 * 60 * 24);
        const thresholds = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
        shouldProcess = diffDays >= (thresholds[schedule.frequency] || 7);
      }

      const nextDates = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + (nextDates[schedule.frequency] || 7));

      if (!shouldProcess) { results.push({ schedule_id: schedule.id, skipped: true, reason: "Not yet due" }); continue; }
      if (!ownerId) { results.push({ schedule_id: schedule.id, skipped: true, reason: "Missing owner" }); continue; }

      const links = await D.AffiliateLink.filter({ created_by_id: ownerId });
      const totalEarnedCents = links.reduce((sum, l) => sum + moneyToCents(l.earnings), 0);

      const payouts = await D.Payout.filter({ created_by_id: ownerId });
      const reservedCents = payouts
        .filter((p) => ["pending", "approved", "paid"].includes(p.status))
        .reduce((sum, p) => sum + moneyToCents(p.amount), 0);

      const availableCents = Math.max(0, totalEarnedCents - reservedCents);
      const availableBalance = centsToMoney(availableCents);
      const minimumAmount = Number(schedule.minimum_amount) || 25;
      const minimumAmountCents = moneyToCents(minimumAmount);
      let createdPayout = null;

      if (availableCents >= minimumAmountCents) {
        createdPayout = await D.Payout.create({
          created_by_id: ownerId,
          user_id: ownerId,
          amount: availableBalance,
          status: "pending",
          payment_method: schedule.payment_method || "paypal",
          payment_email: schedule.payment_email || "",
          source: "auto",
          requested_at: now.toISOString(),
          notes: `Auto-payout created from ${schedule.frequency || "weekly"} schedule.`,
        });
      }

      await D.PayoutSchedule.update(schedule.id, {
        last_processed_at: now.toISOString(),
        next_payout_date: nextDate.toISOString().split("T")[0],
        notes: createdPayout
          ? `Created payout $${availableBalance.toFixed(2)} on ${now.toISOString()}`
          : `Checked balance $${availableBalance.toFixed(2)} on ${now.toISOString()}; minimum is $${minimumAmount.toFixed(2)}`,
      });

      results.push({
        schedule_id: schedule.id,
        processed: true,
        payout_created: !!createdPayout,
        payout_id: createdPayout?.id || null,
        available_balance: availableBalance,
        minimum_amount: minimumAmount,
        next_payout_date: nextDate.toISOString().split("T")[0],
      });
    }

    res.status(200).json({
      message: "Auto-payout run complete",
      processed: results.filter((r) => r.processed).length,
      created: results.filter((r) => r.payout_created).length,
      skipped: results.filter((r) => r.skipped).length,
      results,
    });
  } catch (error) {
    console.error("processAutoPayouts failed:", error);
    res.status(500).json({ error: error.message });
  }
}
