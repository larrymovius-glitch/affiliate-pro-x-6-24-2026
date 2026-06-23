import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);

    // eBay sends isAuth=true on success, isAuth=false on decline
    const isAuth = url.searchParams.get("isAuth");
    const sessId = url.searchParams.get("sessid");
    const ruName = "Lawerence_Moviu-Lawerenc-Affili-zgqyaq";

    if (isAuth === "false" || !sessId) {
      return Response.redirect("https://apx.amhere4utoday.com/error", 302);
    }

    // Exchange the session ID for a user token via eBay's FetchToken API
    const fetchTokenXml = `<?xml version="1.0" encoding="utf-8"?>
<FetchTokenRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken></eBayAuthToken>
  </RequesterCredentials>
  <SessionID>${sessId}</SessionID>
</FetchTokenRequest>`;

    const ebayApiUrl = "https://api.ebay.com/ws/api.dll";
    const tokenRes = await fetch(ebayApiUrl, {
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

    // Extract token and expiration from XML response
    const tokenMatch = tokenXml.match(/<eBayAuthToken>([\s\S]*?)<\/eBayAuthToken>/);
    const expiresMatch = tokenXml.match(/<HardExpirationTime>([\s\S]*?)<\/HardExpirationTime>/);

    if (!tokenMatch) {
      console.error("eBay FetchToken failed:", tokenXml);
      return Response.redirect("https://apx.amhere4utoday.com/error", 302);
    }

    const ebayToken = tokenMatch[1].trim();
    const expiresAt = expiresMatch ? expiresMatch[1].trim() : null;

    // Store the token for the authenticated user (service role since this is a redirect callback)
    await base44.asServiceRole.entities.EbayToken.deleteMany({});
    await base44.asServiceRole.entities.EbayToken.create({
      token: ebayToken,
      expires_at: expiresAt,
      ru_name: ruName,
      connected_at: new Date().toISOString(),
    });

    return Response.redirect("https://apx.amhere4utoday.com/dashboard", 302);

  } catch (error) {
    console.error("eBay OAuth callback error:", error.message);
    return Response.redirect("https://apx.amhere4utoday.com/error", 302);
  }
});