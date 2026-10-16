import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Removes the caller's own stored Page token, which also stops their daily
// auto-posts. Revoking the app at Facebook's end is done from the account's
// own "Business integrations" settings.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { error } = await adminClient()
      .from("social_connections")
      .delete()
      .eq("platform", "facebook")
      .eq("user_id", user.id);
    if (error) throw error;

    return res.status(200).json({ disconnected: true });
  } catch (error) {
    console.error("facebookDisconnect failed:", error);
    return res.status(500).json({ error: "Unable to disconnect Facebook" });
  }
}
