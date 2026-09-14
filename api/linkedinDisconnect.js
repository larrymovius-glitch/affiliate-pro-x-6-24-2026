import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Removes the caller's own stored LinkedIn token. Scoped to them: nobody can
// disconnect anyone else's LinkedIn.
//
// Deleting the row does not revoke the token at LinkedIn's end -- the member
// does that from their LinkedIn settings (Data privacy > Permitted services).
// This stops the app using it, which is the part this side controls.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { error } = await adminClient()
      .from("social_connections")
      .delete()
      .eq("platform", "linkedin")
      .eq("user_id", user.id);
    if (error) throw error;

    return res.status(200).json({ disconnected: true });
  } catch (error) {
    console.error("linkedinDisconnect failed:", error);
    return res.status(500).json({ error: "Unable to disconnect LinkedIn" });
  }
}
