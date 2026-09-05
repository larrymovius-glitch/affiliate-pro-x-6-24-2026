import { adminClient, getAuthedUser, isCronRequest } from "./_lib/supabase.js";

// Keeps every user's Instagram connection alive.
//
// Instagram's long-lived tokens last 60 days and can be refreshed for another
// 60 -- but only while the token is at least 24 hours old and has NOT expired.
// Once it lapses there is no refresh path: the user has to walk the whole
// OAuth flow again, and in the meantime every post of theirs fails with an
// auth error that looks nothing like an expired token.
//
// Runs daily on the Vercel cron in vercel.json. Refreshing well before the
// deadline means a few consecutive failed runs (an outage, a deploy freeze)
// still leave weeks of headroom.
const REFRESH_WHEN_DAYS_LEFT_BELOW = 15;
const MIN_TOKEN_AGE_MS = 25 * 3600 * 1000; // Instagram requires >24h; margin for clock skew.

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    // The nightly run sweeps every connection; a signed-in user may force a
    // refresh of THEIR OWN only, to recover one close to lapsing without
    // waiting for the cron. Never anyone else's -- a user refreshing the whole
    // table would rotate strangers' tokens.
    if (!cronOk && !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appSecret) return res.status(500).json({ error: "INSTAGRAM_APP_SECRET not configured" });

    const admin = adminClient();
    let query = admin
      .from("social_connections")
      .select("id, access_token, expires_at, created_at")
      .eq("platform", "instagram");
    if (!cronOk) query = query.eq("user_id", user.id);
    const { data: connections, error } = await query;
    if (error) throw error;

    if (!connections?.length) {
      return res.status(200).json({ message: "No Instagram connection to refresh", refreshed: 0 });
    }

    const results = [];
    for (const conn of connections) {
      const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
      const daysLeft = Math.floor((expiresAt - Date.now()) / 86400000);
      const ageMs = Date.now() - new Date(conn.created_at).getTime();

      if (expiresAt && expiresAt <= Date.now()) {
        // Past the deadline: refreshing is not possible, only reconnecting.
        console.error("refreshInstagramToken: token already expired, reconnect required", conn.id);
        results.push({ id: conn.id, refreshed: false, reason: "expired — reconnect required" });
        continue;
      }
      if (ageMs < MIN_TOKEN_AGE_MS) {
        results.push({ id: conn.id, refreshed: false, reason: "younger than 24h" });
        continue;
      }
      if (daysLeft >= REFRESH_WHEN_DAYS_LEFT_BELOW && body.force !== true) {
        results.push({ id: conn.id, refreshed: false, reason: `${daysLeft}d left` });
        continue;
      }

      const refreshRes = await fetch(
        `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
          grant_type: "ig_refresh_token",
          access_token: conn.access_token,
        })}`
      );
      const refreshed = await refreshRes.json().catch(() => ({}));
      if (!refreshRes.ok || !refreshed?.access_token) {
        console.error("refreshInstagramToken: refresh failed", conn.id, refreshed);
        results.push({ id: conn.id, refreshed: false, reason: "refresh call failed" });
        continue;
      }

      const newExpiry = new Date(
        Date.now() + (Number(refreshed.expires_in) || 60 * 24 * 3600) * 1000
      ).toISOString();

      // created_at moves with the refresh so the >24h age rule is measured
      // against this token, not the original connection.
      const { error: updateError } = await admin
        .from("social_connections")
        .update({ access_token: refreshed.access_token, expires_at: newExpiry, created_at: new Date().toISOString() })
        .eq("id", conn.id);
      if (updateError) throw updateError;

      console.log("refreshInstagramToken: refreshed", conn.id, "now expires", newExpiry);
      results.push({ id: conn.id, refreshed: true, expires_at: newExpiry });
    }

    return res.status(200).json({
      refreshed: results.filter((r) => r.refreshed).length,
      results,
    });
  } catch (error) {
    console.error("refreshInstagramToken failed:", error);
    return res.status(500).json({ error: error.message });
  }
}
