import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const verifiedStatuses = ["verified_veteran", "disabled_vet", "homeless_vet"];
    if (verifiedStatuses.includes(user.veteran_status)) {
      return res.status(200).json({ status: "verified", message: "Veteran access is already active." });
    }
    if (user.veteran_status === "pending_verification") {
      return res.status(200).json({ status: "pending_verification", message: "Your veteran verification is already under review." });
    }

    const { documentPath } = req.body || {};
    if (!documentPath || !String(documentPath).startsWith(`${user.id}/`)) {
      return res.status(400).json({ error: "A secure verification document is required" });
    }

    const D = db();
    await D.User.update(user.id, { veteran_status: "pending_verification" });
    await D.VeteranVerificationDocument.create({
      user_id: user.id,
      storage_path: documentPath,
      submitted_at: new Date().toISOString(),
      status: "pending",
    });

    res.status(200).json({
      status: "pending_verification",
      message: "Veteran verification request submitted. An authorized reviewer will review it shortly.",
    });
  } catch (error) {
    console.error("requestVeteranVerification failed:", error);
    res.status(500).json({ error: error.message });
  }
}
