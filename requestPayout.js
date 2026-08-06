import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

function moneyToCents(v) { return Math.round((Number(v) || 0) * 100); }
function centsToMoney(c) { return Number(((Number(c) || 0) / 100).toFixed(2)); }

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { amount } = req.body || {};
    const requestedCents = moneyToCents(amount);
    if (!requestedCents || requestedCents <= 0) {
      return res.status(400).json({ error: "Enter a payout amount greater than $0." });
    }

    const D = db();
    const links = await D.AffiliateLink.filter({ created_by_id: user.id });
    const totalEarnedCents = links.reduce((sum, l) => sum + moneyToCents(l.earnings), 0);

    const byCreator = await D.Payout.filter({ created_by_id: user.id });
    const byUserId = await D.Payout.filter({ user_id: user.id });
    const payoutMap = new Map([...byCreator, ...byUserId].map((p) => [p.id, p]));
    const payouts = [...payoutMap.values()];

    const reservedCents = payouts
      .filter((p) => ["pending", "approved", "paid"].includes(p.status))
      .reduce((sum, p) => sum + moneyToCents(p.amount), 0);
    const availableCents = Math.max(0, totalEarnedCents - reservedCents);

    if (requestedCents > availableCents) {
      return res.status(400).json({
        error: `Insufficient balance. Available: $${centsToMoney(availableCents).toFixed(2)}`,
        available: centsToMoney(availableCents),
        requested: centsToMoney(requestedCents),
      });
    }

    const payout = await D.Payout.create({
      created_by_id: user.id,
      user_id: user.id,
      amount: centsToMoney(requestedCents),
      status: "pending",
      source: "manual",
      requested_at: new Date().toISOString(),
      notes: `User requested payout. Available balance at request: $${centsToMoney(availableCents).toFixed(2)}.`,
    });

    res.status(200).json({ success: true, payout });
  } catch (error) {
    console.error("requestPayout failed:", error);
    res.status(500).json({ error: error.message });
  }
}
