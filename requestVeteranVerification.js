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

    await db().User.update(user.id, { veteran_status: "pending_verification" });

    res.status(200).json({
      status: "pending_verification",
      message: "Veteran verification request submitted. An admin will review it shortly.",
    });
  } catch (error) {
    console.error("requestVeteranVerification failed:", error);
    res.status(500).json({ error: error.message });
  }
}
