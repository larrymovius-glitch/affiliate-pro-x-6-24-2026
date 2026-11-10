import { audit, isApprovalMethod } from "./_lib/postApprovals.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// "Skip today": sets aside every post waiting for the caller's OK. Nothing is
// posted; tomorrow's run offers new ones.
//
// Body: { method, transcript? }
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { user } = await getAuthedUser(req);
    if (!user?.id) return res.status(401).json({ error: "Please log in again." });

    const { method, transcript } = req.body || {};
    if (!isApprovalMethod(method)) return res.status(400).json({ error: "Say how the skip was chosen." });

    const admin = adminClient();
    const { data: skipped, error } = await admin
      .from("pending_approvals")
      .update({ status: "skipped", decided_via: method, decided_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select("id, product_name");
    if (error) throw error;

    for (const row of skipped || []) {
      await audit(admin, { user_id: user.id, approval_id: row.id, action: "skipped", method, transcript, detail: { product: row.product_name, why: "skip today" } });
    }
    return res.status(200).json({ skipped: skipped?.length || 0 });
  } catch (error) {
    console.error("skipApprovals failed:", error);
    return res.status(500).json({ error: "Something went wrong. Nothing was changed." });
  }
}
