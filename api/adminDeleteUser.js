import { db } from "./_lib/db.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";
import { deleteAccountCompletely } from "./_lib/accountDeletion.js";

// An admin removing someone's account completely -- data and login -- so
// the email is free to sign up again. Admins can't remove themselves here
// (that is api/deleteAccount.js, with a password) or another admin (take the
// role away first, so it is never one click).
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (user?.role !== "admin") return res.status(403).json({ error: "Forbidden: admin only" });

    const userId = String(req.body?.userId || "").trim();
    const email = String(req.body?.email || "").trim();
    if (!userId || !email) return res.status(400).json({ error: "userId and email are required" });
    if (userId === user.id) return res.status(400).json({ error: "Use Delete Account in your profile menu to remove your own account." });

    const D = db();
    const target = await D.User.get(userId);
    if (!target) return res.status(404).json({ error: "No such user" });
    if (target.role === "admin") return res.status(400).json({ error: "Remove their admin role first." });

    await deleteAccountCompletely({ D, admin: adminClient(), userId, email });
    console.log(`adminDeleteUser: ${user.email} removed ${email}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("adminDeleteUser error:", error);
    res.status(error.status || 500).json({ error: error.message });
  }
}
