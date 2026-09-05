import crypto from "crypto";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Starts the Instagram OAuth handshake for the shared house account, and
// reports whether one is currently connected.
//
// Admin-only, matching api/postToInstagram.js, which has always published to a
// single shared account rather than each user's own. Per-user Instagram would
// need Meta App Review plus business verification; a single account the app
// owner controls needs no review at all -- add that account as an Instagram
// Tester on the Meta app and development mode is enough.
//
// Flow (Instagram API with Instagram Login -- the graph.instagram.com family
// postToInstagram.js already publishes against, not the Facebook Login one):
//   1. here          -> https://api.instagram.com/oauth/authorize
//   2. callback      -> POST https://api.instagram.com/oauth/access_token   (short-lived, ~1h)
//   3. callback      -> GET  https://graph.instagram.com/access_token       (long-lived, 60d)
//   4. cron          -> GET  https://graph.instagram.com/refresh_access_token
export const AUTHORIZE_URL = "https://api.instagram.com/oauth/authorize";
export const SCOPES = "instagram_business_basic,instagram_business_content_publish";

export function redirectUri(origin) {
  return `${origin}/api/instagramCallback`;
}

// The callback arrives as a plain browser redirect with no Authorization
// header, so it cannot call getAuthedUser to find out who started the flow.
// `state` carries that identity and is signed, so a stranger cannot craft a
// callback that attaches their own Instagram account to this app -- or point
// the flow at another user's id. Signed with the app secret we already hold
// rather than introducing another secret to manage.
export function signState(userId, secret, issuedAt = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, ts: issuedAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function verifyState(state, secret, now = Date.now()) {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  // A signed state is still only good briefly -- it should not stay replayable
  // if it leaks from browser history or a referrer header.
  if (!parsed?.uid || !parsed?.ts || now - parsed.ts > STATE_MAX_AGE_MS) return null;
  return parsed;
}

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Never selects access_token: the admin's own RLS policy would allow it,
    // but there is no reason for a live token to reach a browser.
    const { data: connection } = await adminClient()
      .from("social_connections")
      .select("platform, expires_at, created_at")
      .eq("platform", "instagram")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const configured = Boolean(appId && appSecret);
    const expiresAt = connection?.expires_at || null;
    const daysLeft = expiresAt
      ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000)
      : null;

    return res.status(200).json({
      configured,
      connected: Boolean(connection),
      expires_at: expiresAt,
      days_left: daysLeft,
      // Meta requires the redirect URI to match the app's allowlist exactly,
      // so show it rather than leaving the admin to guess the spelling.
      redirect_uri: redirectUri(origin),
      authorize_url: configured
        ? `${AUTHORIZE_URL}?${new URLSearchParams({
            client_id: appId,
            redirect_uri: redirectUri(origin),
            scope: SCOPES,
            response_type: "code",
            state: signState(user.id, appSecret),
          })}`
        : null,
    });
  } catch (error) {
    console.error("instagramConnect failed:", error);
    return res.status(500).json({ error: "Unable to start Instagram connection" });
  }
}
