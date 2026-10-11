import { createClient } from "@supabase/supabase-js";
import { db } from "./_lib/db.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";
import { deleteAccountCompletely } from "./_lib/accountDeletion.js";

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "Current password is required" });

    // Re-verify credentials with a plain anon-key client before deleting anything.
    const verify = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { error: signInError } = await verify.auth.signInWithPassword({ email: user.email, password });
    if (signInError) {
      console.warn("Account deletion credential verification failed for user:", user.id);
      return res.status(401).json({ error: "The current password is incorrect" });
    }

    await deleteAccountCompletely({ D: db(), admin: adminClient(), userId: user.id, email: user.email });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("deleteAccount error:", error);
    res.status(error.status || 500).json({ error: error.message });
  }
}
