import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Admin Control Panel's "Invite New User" -- never had a server-side
// implementation. src/pages/Admin.jsx called base44.users.inviteUser(...),
// a Base44 SDK method the Supabase-backed shim (src/api/base44Client.js)
// never carried a `users` namespace for at all, so every invite threw
// "Cannot read properties of undefined (reading 'inviteUser')" before a
// request ever left the browser.
//
// Supabase's own admin.inviteUserByEmail creates the auth.users row and
// sends the invite email; the existing on_auth_user_created trigger
// (handle_new_user, managed in the Supabase project, not this repo) creates
// the matching profiles row automatically, same as a normal signup -- it
// defaults role to 'user', so an admin invite needs one follow-up update.
const ALLOWED_ROLES = new Set(["user", "admin"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user: caller } = await getAuthedUser(req);
    if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const email = String(req.body?.email || "").trim().toLowerCase();
    const role = ALLOWED_ROLES.has(req.body?.role) ? req.body.role : "user";
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required" });

    const admin = adminClient();
    const origin = req.headers?.host ? `https://${req.headers.host}` : undefined;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: origin ? `${origin}/` : undefined,
    });
    if (error) return res.status(error.status === 422 ? 409 : 500).json({ error: error.message });

    if (role === "admin") {
      const { error: roleError } = await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
      if (roleError) return res.status(500).json({ error: `Invited, but couldn't set the admin role: ${roleError.message}` });
    }

    res.status(200).json({ success: true, user: { id: data.user.id, email: data.user.email, role } });
  } catch (error) {
    console.error("inviteUser error:", error);
    res.status(500).json({ error: error.message });
  }
}
