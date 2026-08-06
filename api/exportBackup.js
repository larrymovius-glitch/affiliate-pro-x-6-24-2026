import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

// Admin-only. Full JSON snapshot of every business-critical table so your
// data is never hostage to any platform. Download regularly.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const D = db();
    const entities = [
      "User", "AffiliateLink", "Product", "GeneratedPost", "Campaign",
      "Payout", "PayoutSchedule", "Payment", "Subscription", "Notification",
      "ClickEvent", "ConversionEvent", "AdAsset", "AdReview",
    ];

    const backup = { exported_at: new Date().toISOString(), exported_by: user.email };
    for (const name of entities) {
      try {
        backup[name] = await D[name].list("-created_date", 10000);
      } catch (e) {
        backup[name] = { error: `Could not export: ${e.message}` };
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="apx-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.status(200).send(JSON.stringify(backup, null, 2));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
