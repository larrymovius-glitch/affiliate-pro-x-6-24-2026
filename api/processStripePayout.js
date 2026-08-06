import Stripe from "stripe";
import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

function moneyToCents(v) { return Math.round((Number(v) || 0) * 100); }
function centsToMoney(c) { return Number(((Number(c) || 0) / 100).toFixed(2)); }

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ error: "Server misconfiguration" });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const D = db();
    const { payoutId, veteranEmail } = req.body || {};
    if (!payoutId) return res.status(400).json({ error: "Invalid payout data" });

    const payoutRecord = await D.Payout.get(payoutId);
    if (!payoutRecord) return res.status(404).json({ error: "Payout not found" });
    if (payoutRecord.status !== "approved") {
      return res.status(400).json({ error: `Payout is not approved (status: ${payoutRecord.status})` });
    }
    const amountCents = moneyToCents(payoutRecord.amount);
    if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Invalid payout amount on record" });
    const amount = centsToMoney(amountCents);

    const recipient = await D.User.get(payoutRecord.created_by_id);
    if (!recipient) return res.status(404).json({ error: "Recipient user not found" });
    if (veteranEmail && recipient.email !== veteranEmail) {
      return res.status(400).json({ error: "Recipient email does not match the payout record" });
    }
    if (!recipient.stripeAccountId || !String(recipient.stripeAccountId).startsWith("acct_")) {
      return res.status(400).json({ error: "Recipient has no connected Stripe account. They must complete Stripe Connect onboarding and save their account via payment settings first." });
    }

    const recipientLinks = await D.AffiliateLink.filter({ created_by_id: recipient.id });
    const totalEarnedCents = recipientLinks.reduce((sum, l) => sum + moneyToCents(l.earnings), 0);

    const recipientPayouts = await D.Payout.filter({ created_by_id: recipient.id });
    const reservedByOtherPayoutsCents = recipientPayouts
      .filter((p) => p.id !== payoutId && ["pending", "approved", "paid"].includes(p.status))
      .reduce((sum, p) => sum + moneyToCents(p.amount), 0);

    const availableCents = totalEarnedCents - reservedByOtherPayoutsCents;
    if (amountCents > availableCents) {
      return res.status(400).json({ error: "Insufficient balance", available: centsToMoney(availableCents), requested: amount });
    }

    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination: recipient.stripeAccountId,
        transfer_group: `payout_${payoutId}`,
        metadata: { payout_id: payoutId, recipient_user_id: recipient.id, app_id: "affiliate-pro-x" },
      },
      { idempotencyKey: `payout_${payoutId}` }
    );

    await D.Payout.update(payoutId, {
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: "bank_transfer",
      notes: `Stripe transfer ${transfer.id}`,
    });

    res.status(200).json({ success: true, transfer_id: transfer.id, amount });
  } catch (error) {
    console.error("Payout error:", error);
    res.status(500).json({ error: error.message });
  }
}
