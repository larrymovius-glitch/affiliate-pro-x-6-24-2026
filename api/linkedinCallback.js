import { adminClient } from "./_lib/supabase.js";
import { verifyState } from "./instagramConnect.js";
import { TOKEN_URL, redirectUri } from "./linkedinConnect.js";

// Where LinkedIn sends the browser back after the member approves. Public by
// necessity -- a redirect carries no Authorization header -- so the signed
// `state` from linkedinConnect.js is what proves who started the flow, and so
// whose account the token is attached to. An unsigned or stale state is
// refused before any token is exchanged.

// Always lands the member back in the app with a readable outcome rather than
// a bare JSON error page they cannot act on.
function back(res, origin, params) {
  const qs = new URLSearchParams({ li: "1", ...params });
  res.writeHead(302, { Location: `${origin}/social?${qs}` });
  res.end();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || `https://${req.headers.host}`;

  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error("linkedinCallback: LINKEDIN_CLIENT_ID/SECRET not configured");
      return back(res, origin, { status: "error", reason: "not_configured" });
    }

    // LinkedIn reports a refusal (user_cancelled_login, user_cancelled_authorize)
    // by sending the member back with an error instead of a code.
    const { code, state, error: liError, error_description: liErrorDescription } = req.query || {};
    if (liError) {
      console.log("linkedinCallback: declined or LinkedIn errored:", liError, liErrorDescription);
      const cancelled = String(liError).startsWith("user_cancelled");
      return back(res, origin, cancelled ? { status: "cancelled" } : { status: "error", reason: "linkedin_error" });
    }
    if (!code) return back(res, origin, { status: "error", reason: "no_code" });

    const claims = verifyState(state, clientSecret);
    if (!claims) {
      console.error("linkedinCallback: state failed verification");
      return back(res, origin, { status: "error", reason: "bad_state" });
    }

    // The state proves which account started the flow. Confirm it still exists
    // before attaching a token to it.
    const admin = adminClient();
    const { data: profile } = await admin
      .from("profiles").select("id").eq("id", claims.uid).maybeSingle();
    if (!profile) {
      console.error("linkedinCallback: state uid no longer exists:", claims.uid);
      return back(res, origin, { status: "error", reason: "unknown_user" });
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri(origin),
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData?.access_token) {
      console.error("linkedinCallback: code exchange failed:", tokenRes.status, tokenData?.error, tokenData?.error_description);
      return back(res, origin, { status: "error", reason: "code_exchange_failed" });
    }

    // Confirm the token can identify the member -- every post needs their `sub`
    // as its author. This fails when the OpenID Connect product was never added
    // to the app, which is far easier to fix now than on the first post.
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !me?.sub) {
      console.error("linkedinCallback: userinfo failed:", meRes.status, me?.message);
      return back(res, origin, { status: "error", reason: "profile_failed" });
    }

    const expiresAt = new Date(
      Date.now() + (Number(tokenData.expires_in) || 60 * 24 * 3600) * 1000
    ).toISOString();

    // Upsert on the table's own UNIQUE (user_id, platform): reconnecting
    // replaces this member's row and touches nobody else's.
    const { error: upsertError } = await admin
      .from("social_connections")
      .upsert(
        {
          user_id: claims.uid,
          platform: "linkedin",
          access_token: tokenData.access_token,
          // Only approved Marketing Developer Platform apps receive one; kept if
          // LinkedIn ever sends it, harmlessly null otherwise.
          refresh_token: tokenData.refresh_token || null,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" }
      );
    if (upsertError) throw upsertError;

    console.log("linkedinCallback: connected, expires", expiresAt);
    return back(res, origin, { status: "connected" });
  } catch (error) {
    console.error("linkedinCallback failed:", error);
    return back(res, origin, { status: "error", reason: "unexpected" });
  }
}
