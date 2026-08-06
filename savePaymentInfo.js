import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { stripeAccountId, email } = req.body || {};
    if (!stripeAccountId || !email) {
      return res.status(400).json({ error: "Missing required fields", required: ["stripeAccountId", "email"] });
    }
    if (!stripeAccountId.startsWith("acct_")) {
      return res.status(400).json({ error: 'Invalid Stripe account ID format. Should start with "acct_"' });
    }

    const D = db();
    await D.User.update(user.id, { stripeAccountId, paymentEmail: email, payoutReady: true });

    const existingSchedule = await D.PayoutSchedule.filter({ created_by_id: user.id });
    if (existingSchedule.length === 0) {
      await D.PayoutSchedule.create({
        created_by_id: user.id,
        is_active: true,
        frequency: "weekly",
        minimum_amount: 25,
        payment_method: "bank_transfer",
        payment_email: email,
        notes: `Auto-configured for user ${user.email}`,
      });
    }

    res.status(200).json({ success: true, message: "Payment info saved! You will receive commissions automatically.", payoutReady: true });
  } catch (error) {
    console.error("Payment info error:", error);
    res.status(500).json({ error: error.message });
  }
}
