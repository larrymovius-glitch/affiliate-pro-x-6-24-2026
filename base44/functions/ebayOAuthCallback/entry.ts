import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Security: this endpoint no longer stores tokens on the unauthenticated GET redirect
// from eBay. The GET redirect just forwards the session ID to the Admin page; the
// Admin page (logged-in admin only) then POSTs the session ID here to complete the
// token exchange. This prevents anyone from overwriting the global eBay token.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const ruName = "Lawerence_Moviu-Lawerenc-Affili-zgqyaq";

    // --- Unauthenticated GET redirect from eBay: never store anything here ---
    if (req.method === "GET") {
      const isAuth = url.searchParams.get("isAuth");
      const sessId = url.searchParams.get("sessid");
      if (isAuth === "false" || !sessId) {
        return Response.redirect("https://apx.amhere4utoday.com/", 302);
      }
      // Hand the session ID to the Admin page to complete the exchange while authenticated
      return Response.redirect(
        `https://apx.amhere4utoday.com/admin?ebay_sessid=${encodeURIComponent(sessId)}`,
        302
      );
    }

    // --- Authenticated POST from the Admin page: complete the token exchange ---
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { sessid } = await req.json();
    if (!sessid || typeof sessid !== 'string') {
      return Response.json({ error: 'Missing sessid' }, { status: 400 });
    }

    // Exchange the session ID for a user token via eBay's FetchToken API
    const fetchTokenXml = `<?xml version="1.0" encoding="utf-8"?>
<FetchTokenRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <SessionID>${sessid.replace(/[<>&]/g, '')}</SessionID>
</FetchTokenRequest>`;

    const tokenRes = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-DEV-NAME": Deno.env.get("EBAY_DEV_ID") || "",
        "X-EBAY-API-APP-NAME": Deno.env.get("EBAY_APP_ID") || "",
        "X-EBAY-API-CERT-NAME": Deno.env.get("EBAY_CERT_ID") || "",
        "X-EBAY-API-CALL-NAME": "FetchToken",
        "X-EBAY-API-SITEID": "0",
        "Content-Type": "text/xml",
      },
      body: fetchTokenXml,
    });

    const tokenXml = await tokenRes.text();
    const tokenMatch = tokenXml.match(/<eBayAuthToken>([\s\S]*?)<\/eBayAuthToken>/);
    const expiresMatch = tokenXml.match(/<HardExpirationTime>([\s\S]*?)<\/HardExpirationTime>/);

    if (!tokenMatch) {
      console.error("eBay FetchToken failed:", tokenXml);
      return Response.json({ error: 'eBay token exchange failed' }, { status: 400 });
    }

    await base44.asServiceRole.entities.EbayToken.deleteMany({});
    await base44.asServiceRole.entities.EbayToken.create({
      token: tokenMatch[1].trim(),
      expires_at: expiresMatch ? expiresMatch[1].trim() : null,
      ru_name: ruName,
      connected_at: new Date().toISOString(),
    });

    return Response.json({ success: true });

  } catch (error) {
    console.error("eBay OAuth callback error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});