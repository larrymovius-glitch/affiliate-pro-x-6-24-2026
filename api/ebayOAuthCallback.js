import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

// GET: unauthenticated redirect from eBay — just forwards the session ID to
// the Admin page. POST: authenticated admin completes the token exchange.
export default async function handler(req, res) {
  try {
    const ruName = "Lawerence_Moviu-Lawerenc-Affili-zgqyaq";
    const appOrigin = `https://${req.headers.host}`;

    if (req.method === "GET") {
      const isAuth = req.query?.isAuth;
      const sessId = req.query?.sessid;
      if (isAuth === "false" || !sessId) {
        res.writeHead(302, { Location: appOrigin });
        return res.end();
      }
      res.writeHead(302, { Location: `${appOrigin}/admin?ebay_sessid=${encodeURIComponent(sessId)}` });
      return res.end();
    }

    const { user } = await getAuthedUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { sessid } = req.body || {};
    if (!sessid || typeof sessid !== "string") return res.status(400).json({ error: "Missing sessid" });

    const fetchTokenXml = `<?xml version="1.0" encoding="utf-8"?>
<FetchTokenRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken></eBayAuthToken></RequesterCredentials>
  <SessionID>${sessid.replace(/[<>&]/g, "")}</SessionID>
</FetchTokenRequest>`;

    const tokenRes = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-DEV-NAME": process.env.EBAY_DEV_ID || "",
        "X-EBAY-API-APP-NAME": process.env.EBAY_APP_ID || "",
        "X-EBAY-API-CERT-NAME": process.env.EBAY_CERT_ID || "",
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
      return res.status(400).json({ error: "eBay token exchange failed" });
    }

    const D = db();
    const existing = await D.EbayToken.list();
    for (const t of existing) await D.EbayToken.delete(t.id);
    await D.EbayToken.create({
      token: tokenMatch[1].trim(),
      expires_at: expiresMatch ? expiresMatch[1].trim() : null,
      ru_name: ruName,
      connected_at: new Date().toISOString(),
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("eBay OAuth callback error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
