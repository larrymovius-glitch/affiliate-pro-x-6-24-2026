import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// profiles.subscription_tier already existed in the live schema (free | pro |
// veteran_free) with nothing anywhere reading or writing it -- the Admin
// panel could only toggle role (admin/user) and veteran_status, with no way
// to manually grant someone a paid-equivalent tier. Uses the service role,
// same as reviewVeteranVerification.js, so this doesn't depend on the
// column-level grant allowlist that scopes what a logged-in user can edit
// on their own row -- an admin is writing to someone else's row here.
const ALLOWED_TIERS = new Set(["free", "pro", "veteran_free"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user: admin } = await getAuthedUser(req);
    if (!admin || admin.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const { userId, tier } = req.body || {};
    if (!userId || !ALLOWED_TIERS.has(tier)) {
      return res.status(400).json({ error: "A user and a valid tier are required" });
    }

    const { error } = await adminClient().from("profiles").update({ subscription_tier: tier }).eq("id", userId);
    if (error) throw error;

    return res.status(200).json({ tier });
  } catch (error) {
    console.error("updateSubscriptionTier failed:", error);
    return res.status(500).json({ error: "Unable to update subscription tier" });
  }
}
