import { adminClient, getAuthedUser } from "./_lib/supabase.js";

const ALLOWED_STATUSES = new Set([
  "regular",
  "verified_veteran",
  "disabled_vet",
  "homeless_vet",
  "pending_verification",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user: reviewer } = await getAuthedUser(req);
    if (!reviewer || reviewer.role !== "admin") return res.status(403).json({ error: "Reviewer access required" });

    const { userId, veteranStatus, veteranNotes = "" } = req.body || {};
    if (!userId || !ALLOWED_STATUSES.has(veteranStatus)) {
      return res.status(400).json({ error: "A user and valid veteran status are required" });
    }
    if (typeof veteranNotes !== "string" || veteranNotes.length > 2000) {
      return res.status(400).json({ error: "Notes must be 2,000 characters or fewer" });
    }

    const admin = adminClient();
    const { error } = await admin.rpc("review_veteran_status", {
      p_subject_user_id: userId,
      p_reviewer_user_id: reviewer.id,
      p_new_status: veteranStatus,
      p_reviewer_notes: veteranNotes,
    });
    if (error?.message === "Profile not found") return res.status(404).json({ error: "User not found" });
    if (error) throw error;

    return res.status(200).json({ status: veteranStatus });
  } catch (error) {
    console.error("reviewVeteranVerification failed:", error);
    return res.status(500).json({ error: "Unable to save veteran verification review" });
  }
}
