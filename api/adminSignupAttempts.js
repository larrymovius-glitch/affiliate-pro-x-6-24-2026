import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

// The latest signup tries, with where each came from, for the Admin page.
// signup_attempts has no RLS policies, so only this (service role, admin
// checked) can read it.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden: admin only" });
    const attempts = await db().SignupAttempt.list("-created_at", 100);
    res.status(200).json({ attempts });
  } catch (error) {
    console.error("adminSignupAttempts error:", error);
    res.status(500).json({ error: error.message });
  }
}
