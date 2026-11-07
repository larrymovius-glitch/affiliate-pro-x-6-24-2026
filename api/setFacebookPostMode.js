import { audit } from "./_lib/postApprovals.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// The member's own choice for their Page: "approve" (ask me first) or
// "auto" (post automatically). See _lib/postApprovals.js.
//
// Body: { mode: "approve" | "auto" }
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { user } = await getAuthedUser(req);
    if (!user?.id) return res.status(401).json({ error: "Please log in again." });

    const { mode } = req.body || {};
    if (mode !== "approve" && mode !== "auto") return res.status(400).json({ error: "Choose 'approve' or 'auto'." });

    const admin = adminClient();
    const { data: updated, error } = await admin
      .from("social_connections")
      .update({ post_mode: mode })
      .eq("user_id", user.id)
      .eq("platform", "facebook")
      .select("id");
    if (error) throw error;
    if (!updated?.length) return res.status(400).json({ error: "Connect your Facebook Page first." });

    await audit(admin, { user_id: user.id, action: "mode_changed", method: "tap", detail: { mode } });
    return res.status(200).json({ mode });
  } catch (error) {
    console.error("setFacebookPostMode failed:", error);
    return res.status(500).json({ error: "Could not change the setting." });
  }
}
