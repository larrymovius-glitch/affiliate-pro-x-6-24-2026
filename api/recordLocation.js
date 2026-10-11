import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";
import { locationFromHeaders, locationPatch } from "./_lib/location.js";

// Called by the app once per visit when a user is signed in. Records their
// approximate location (country, region, city): the first one is kept as
// signup_*, and every visit updates last_seen_*.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // The device's own time zone, sent by the app, for the VPN check.
    const deviceTz = String(req.body?.timezone || "");
    const patch = locationPatch(user, locationFromHeaders(req.headers), new Date().toISOString(), deviceTz);
    if (!patch) return res.status(200).json({ recorded: false });

    await db().User.update(user.id, patch);
    res.status(200).json({ recorded: true });
  } catch (error) {
    console.error("recordLocation error:", error);
    res.status(500).json({ error: error.message });
  }
}
