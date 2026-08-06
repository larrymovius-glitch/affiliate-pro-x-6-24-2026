import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const D = db();
    let referralCode = user.referral_code;
    if (!referralCode) {
      const base = (user.full_name || user.email || "friend").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      referralCode = `${base || "VET"}${suffix}`;
      await D.User.update(user.id, { referral_code: referralCode });
    }

    const referred = await D.User.filter({ referred_by_code: referralCode });

    res.status(200).json({ referral_code: referralCode, referred_count: referred.length });
  } catch (error) {
    console.error("getReferralStats error:", error);
    res.status(500).json({ error: error.message });
  }
}
