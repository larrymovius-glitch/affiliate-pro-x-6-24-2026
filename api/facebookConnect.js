import { adminClient, getAuthedUser } from "./_lib/supabase.js";
import { DIALOG_URL, SCOPES } from "./_lib/facebookPosts.js";
import { signState } from "./instagramConnect.js";

// Starts the Facebook Login handshake for posting to the caller's own Facebook
// Page, and reports whether they have one connected.
//
// Facebook lets apps publish to Pages only, never to a personal profile. The
// token kept is the Page's own: issued from a long-lived user token, it does
// not expire, so there is no refresh cron. It stops working only if the person
// changes their password, loses their role on the Page, or removes the app.
//
// Flow (Facebook Login, graph.facebook.com):
//   1. here      -> https://www.facebook.com/<ver>/dialog/oauth
//   2. callback  -> GET /oauth/access_token                       (short-lived user token)
//   3. callback  -> GET /oauth/access_token?grant_type=fb_exchange_token (long-lived user token)
//   4. callback  -> GET /me/accounts                               (Page token, kept)
//
// An app still in Development mode already works for anyone holding a role on
// it, which covers the owner; App Review is what opens it to everyone.
//
// Apps created as the "Business" type use Facebook Login for Business, which
// takes a configuration id instead of a scope list. Set FACEBOOK_LOGIN_CONFIG_ID
// for those; leave it unset for a standard Facebook Login app.

export function redirectUri(origin) {
  return `${origin}/api/facebookCallback`;
}

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const appId = (process.env.FACEBOOK_APP_ID || "").trim();
    const appSecret = (process.env.FACEBOOK_APP_SECRET || "").trim();
    const configId = (process.env.FACEBOOK_LOGIN_CONFIG_ID || "").trim();
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Never selects access_token: a live Page token has no reason to reach a browser.
    const { data: connection } = await adminClient()
      .from("social_connections")
      .select("account_name, created_at")
      .eq("platform", "facebook")
      .eq("user_id", user.id)
      .maybeSingle();

    const configured = Boolean(appId && appSecret);
    const params = {
      client_id: appId,
      redirect_uri: redirectUri(origin),
      response_type: "code",
      state: configured ? signState(user.id, appSecret) : "",
    };
    if (configId) params.config_id = configId;
    else params.scope = SCOPES;

    return res.status(200).json({
      configured,
      connected: Boolean(connection),
      page_name: connection?.account_name || null,
      connected_at: connection?.created_at || null,
      redirect_uri: redirectUri(origin),
      authorize_url: configured ? `${DIALOG_URL}?${new URLSearchParams(params)}` : null,
    });
  } catch (error) {
    console.error("facebookConnect failed:", error);
    return res.status(500).json({ error: "Unable to start Facebook connection" });
  }
}
