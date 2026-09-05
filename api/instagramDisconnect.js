import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Removes the stored house-account token. Admin-only, same as connecting.
//
// Deleting the row here does not revoke the token at Instagram's end -- that is
// done from the account's own "Apps and Websites" settings. This stops the app
// using it, which is the part this side controls.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { error } = await adminClient()
      .from("social_connections")
      .delete()
      .eq("platform", "instagram");
    if (error) throw error;

    return res.status(200).json({ disconnected: true });
  } catch (error) {
    console.error("instagramDisconnect failed:", error);
    return res.status(500).json({ error: "Unable to disconnect Instagram" });
  }
}
