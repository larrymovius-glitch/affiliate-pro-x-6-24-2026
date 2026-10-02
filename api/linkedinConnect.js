import { adminClient, getAuthedUser } from "./_lib/supabase.js";
// The signed-state helpers are platform-neutral -- each platform signs with its
// own app secret. They live in instagramConnect.js because that flow came first.
import { signState } from "./instagramConnect.js";

// Starts the LinkedIn OAuth handshake, and reports whether the caller has a
// connection. Every user connects their OWN LinkedIn; posts publish as that
// member.
//
// Uses two self-serve products, both added on the app's Products tab:
//   - Sign In with LinkedIn using OpenID Connect -> `openid profile`, so
//     /v2/userinfo can say which member is posting (its `sub` becomes the
//     urn:li:person author of every post)
//   - Share on LinkedIn -> `w_member_social`, to publish via /v2/ugcPosts
//
// Access tokens last 60 days, and LinkedIn only issues refresh tokens to
// approved Marketing Developer Platform partners -- so unlike Instagram there
// is no refresh cron. When a token runs out, the member reconnects from /social.
export const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const SCOPES = "openid profile w_member_social";

export function redirectUri(origin) {
  return `${origin}/api/linkedinCallback`;
}

export function authorizeUrl(clientId, redirect, state) {
  // URLSearchParams writes spaces as "+"; LinkedIn documents scopes as
  // space-delimited and percent-encoded, so send %20 rather than rely on "+".
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirect,
    scope: SCOPES,
    state,
  })
    .toString()
    .replace(/\+/g, "%20");
  return `${AUTHORIZE_URL}?${query}`;
}

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Never selects access_token -- there is no reason for a live token to
    // reach a browser.
    const { data: connection } = await adminClient()
      .from("social_connections")
      .select("platform, expires_at, created_at")
      .eq("platform", "linkedin")
      .eq("user_id", user.id)
      .maybeSingle();

    const configured = Boolean(clientId && clientSecret);
    const expiresAt = connection?.expires_at || null;
    const daysLeft = expiresAt
      ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000)
      : null;

    return res.status(200).json({
      configured,
      connected: Boolean(connection),
      expires_at: expiresAt,
      days_left: daysLeft,
      // LinkedIn requires the redirect URL to match the app's Auth tab exactly,
      // so show it rather than leaving the admin to guess the spelling.
      redirect_uri: redirectUri(origin),
      authorize_url: configured ? authorizeUrl(clientId, redirectUri(origin), signState(user.id, clientSecret)) : null,
    });
  } catch (error) {
    console.error("linkedinConnect failed:", error);
    return res.status(500).json({ error: "Unable to start LinkedIn connection" });
  }
}
