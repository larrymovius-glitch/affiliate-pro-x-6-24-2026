import { adminClient } from "./_lib/supabase.js";
import { GRAPH, choosePage, pageIdsFromGranularScopes } from "./_lib/facebookPosts.js";
import { redirectUri } from "./facebookConnect.js";
import { verifyState } from "./instagramConnect.js";

// Where Facebook sends the browser back after the person approves. Public by
// necessity -- a redirect carries no Authorization header -- so the signed
// `state` from facebookConnect.js is what proves who started the flow.

function back(res, origin, params) {
  const qs = new URLSearchParams({ fb: "1", ...params });
  res.writeHead(302, { Location: `${origin}/social?${qs}` });
  res.end();
}

async function getJson(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || `https://${req.headers.host}`;

  try {
    const appId = (process.env.FACEBOOK_APP_ID || "").trim();
    const appSecret = (process.env.FACEBOOK_APP_SECRET || "").trim();
    if (!appId || !appSecret) return back(res, origin, { status: "error", reason: "not_configured" });

    const { code, state, error: fbError } = req.query || {};
    if (fbError) return back(res, origin, { status: "cancelled" });
    if (!code) return back(res, origin, { status: "error", reason: "no_code" });

    const claims = verifyState(state, appSecret);
    if (!claims) return back(res, origin, { status: "error", reason: "bad_state" });

    const admin = adminClient();
    const { data: profile } = await admin.from("profiles").select("id").eq("id", claims.uid).maybeSingle();
    if (!profile) return back(res, origin, { status: "error", reason: "unknown_user" });

    // 1. Code -> short-lived user token.
    const short = await getJson(`${GRAPH}/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri(origin),
      code: String(code),
    })}`);
    if (!short.ok || !short.data?.access_token) {
      console.error("facebookCallback: code exchange failed:", short.data?.error);
      return back(res, origin, { status: "error", reason: "code_exchange_failed" });
    }

    // 2. Long-lived user token. Page tokens issued from it don't expire;
    //    ones issued from the short-lived token die within the hour.
    const long = await getJson(`${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: short.data.access_token,
    })}`);
    if (!long.ok || !long.data?.access_token) {
      console.error("facebookCallback: long-lived exchange failed:", long.data?.error);
      return back(res, origin, { status: "error", reason: "token_exchange_failed" });
    }

    // 3. The Pages this person manages, each with its own token.
    const pages = await getJson(`${GRAPH}/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token,tasks",
      access_token: long.data.access_token,
    })}`);
    let page = choosePage(pages.data?.data);

    // Business-owned Pages are often missing from /me/accounts. Ask which
    // Pages were ticked, then fetch each one's token directly.
    let grantedIds = [];
    if (!page) {
      const debug = await getJson(`${GRAPH}/debug_token?${new URLSearchParams({
        input_token: long.data.access_token,
        access_token: `${appId}|${appSecret}`,
      })}`);
      grantedIds = pageIdsFromGranularScopes(debug.data);
      const fetched = [];
      for (const id of grantedIds) {
        const p = await getJson(`${GRAPH}/${encodeURIComponent(id)}?${new URLSearchParams({
          fields: "id,name,access_token,tasks",
          access_token: long.data.access_token,
        })}`);
        if (p.ok && p.data?.access_token) fetched.push(p.data);
        else console.error("facebookCallback: could not read granted Page", id, p.data?.error);
      }
      page = choosePage(fetched);
    }

    if (!page) {
      console.error("facebookCallback: no postable Page", {
        accountsCount: pages.data?.data?.length ?? null,
        accountsError: pages.data?.error,
        grantedIds,
      });
      return back(res, origin, { status: "error", reason: "no_pages" });
    }

    // Upsert on UNIQUE (user_id, platform): reconnecting replaces this
    // person's row and touches nobody else's.
    const { error: upsertError } = await admin.from("social_connections").upsert(
      {
        user_id: claims.uid,
        platform: "facebook",
        access_token: page.access_token,
        account_id: page.id,
        account_name: page.name || null,
        expires_at: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );
    if (upsertError) throw upsertError;

    return back(res, origin, { status: "connected" });
  } catch (error) {
    console.error("facebookCallback failed:", error);
    return back(res, origin, { status: "error", reason: "unexpected" });
  }
}
