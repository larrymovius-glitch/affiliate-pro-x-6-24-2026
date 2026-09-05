import { adminClient } from "./_lib/supabase.js";
import { redirectUri, verifyState } from "./instagramConnect.js";

// Where Instagram sends the browser back after the admin approves. Public by
// necessity -- a redirect carries no Authorization header -- so the signed
// `state` from instagramConnect.js is what proves who started the flow. An
// unsigned or stale state is refused before any token is exchanged.

// Always lands the admin back in the app with a readable outcome rather than
// leaving them on a bare JSON error page they cannot act on.
function back(res, origin, params) {
  const qs = new URLSearchParams({ ig: "1", ...params });
  res.writeHead(302, { Location: `${origin}/social?${qs}` });
  res.end();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || `https://${req.headers.host}`;

  try {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appId || !appSecret) {
      console.error("instagramCallback: INSTAGRAM_APP_ID/SECRET not configured");
      return back(res, origin, { status: "error", reason: "not_configured" });
    }

    // Instagram reports a refusal by sending the user back with an error rather
    // than a code -- treat that as a cancellation, not a failure.
    const { code, state, error: igError, error_description: igErrorDescription } = req.query || {};
    if (igError) {
      console.log("instagramCallback: user declined or Instagram errored:", igError, igErrorDescription);
      return back(res, origin, { status: "cancelled" });
    }
    if (!code) return back(res, origin, { status: "error", reason: "no_code" });

    const claims = verifyState(state, appSecret);
    if (!claims) {
      console.error("instagramCallback: state failed verification");
      return back(res, origin, { status: "error", reason: "bad_state" });
    }

    // The state proves which account started the flow; it does not prove that
    // account is still an admin. Re-check, so a revoked admin cannot complete a
    // handshake they began earlier.
    const admin = adminClient();
    const { data: profile } = await admin
      .from("profiles").select("id, role").eq("id", claims.uid).maybeSingle();
    if (profile?.role !== "admin") {
      console.error("instagramCallback: state uid is not an admin:", claims.uid);
      return back(res, origin, { status: "error", reason: "not_admin" });
    }

    // 1. Code -> short-lived token (~1 hour).
    const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri(origin),
        code: String(code),
      }),
    });
    const shortData = await shortRes.json().catch(() => ({}));
    if (!shortRes.ok || !shortData?.access_token) {
      console.error("instagramCallback: code exchange failed:", shortData);
      return back(res, origin, { status: "error", reason: "code_exchange_failed" });
    }

    // 2. Short-lived -> long-lived (60 days). Without this the connection dies
    //    within the hour and every scheduled post afterwards fails.
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: appSecret,
        access_token: shortData.access_token,
      })}`
    );
    const longData = await longRes.json().catch(() => ({}));
    if (!longRes.ok || !longData?.access_token) {
      console.error("instagramCallback: long-lived exchange failed:", longData);
      return back(res, origin, { status: "error", reason: "token_exchange_failed" });
    }

    const expiresAt = new Date(
      Date.now() + (Number(longData.expires_in) || 60 * 24 * 3600) * 1000
    ).toISOString();

    // One shared house account: replace whatever was there rather than
    // accumulating rows postToInstagram would then have to choose between.
    await admin.from("social_connections").delete().eq("platform", "instagram");
    const { error: insertError } = await admin.from("social_connections").insert({
      user_id: claims.uid,
      platform: "instagram",
      access_token: longData.access_token,
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;

    console.log("instagramCallback: connected, expires", expiresAt);
    return back(res, origin, { status: "connected" });
  } catch (error) {
    console.error("instagramCallback failed:", error);
    return back(res, origin, { status: "error", reason: "unexpected" });
  }
}
