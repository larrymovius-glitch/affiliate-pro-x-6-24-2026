import { adminClient } from "./_lib/supabase.js";
import { redirectUri, verifyState } from "./instagramConnect.js";

// Where Instagram sends the browser back after the user approves. Public by
// necessity -- a redirect carries no Authorization header -- so the signed
// `state` from instagramConnect.js is what proves who started the flow, and
// therefore whose account the token gets attached to. An unsigned or stale
// state is refused before any token is exchanged.

// Always lands the user back in the app with a readable outcome rather than
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

    // The state proves which account started the flow. Confirm that account
    // still exists before attaching an Instagram token to it -- a deleted user
    // should not leave an orphaned connection behind.
    const admin = adminClient();
    const { data: profile } = await admin
      .from("profiles").select("id").eq("id", claims.uid).maybeSingle();
    if (!profile) {
      console.error("instagramCallback: state uid no longer exists:", claims.uid);
      return back(res, origin, { status: "error", reason: "unknown_user" });
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

    // Upsert on the table's own UNIQUE (user_id, platform): reconnecting
    // replaces this user's row and touches nobody else's. Deliberately not a
    // delete-then-insert -- if the insert failed after the delete, a user who
    // was reconnecting would be left with no connection at all.
    const { error: upsertError } = await admin
      .from("social_connections")
      .upsert(
        {
          user_id: claims.uid,
          platform: "instagram",
          access_token: longData.access_token,
          expires_at: expiresAt,
          // Reset the clock: refreshInstagramToken measures Instagram's ">24h
          // old" rule from created_at, and this is a brand new token.
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" }
      );
    if (upsertError) throw upsertError;

    console.log("instagramCallback: connected, expires", expiresAt);
    return back(res, origin, { status: "connected" });
  } catch (error) {
    console.error("instagramCallback failed:", error);
    return back(res, origin, { status: "error", reason: "unexpected" });
  }
}
