import { db } from "./_lib/db.js";

// Public click tracker: /api/trackClick?code=<short_code> (also reachable at
// the legacy /functions/trackClick path via vercel.json rewrite).
export default async function handler(req, res) {
  try {
    let code = req.query?.code;
    if (!code && req.body) code = req.body.code;
    if (!code) return res.status(400).json({ error: "Missing code parameter" });

    const D = db();
    const links = await D.AffiliateLink.filter({ short_code: code });
    if (!links.length) return res.status(404).json({ error: "Link not found" });

    const link = links[0];
    const now = new Date().toISOString();

    await D.AffiliateLink.update(link.id, { clicks: (link.clicks || 0) + 1 });

    await D.ClickEvent.create({
      created_by_id: link.created_by_id,
      owner_user_id: link.created_by_id,
      link_id: link.id,
      short_code: link.short_code,
      product_name: link.product_name || "",
      clicked_at: now,
      referrer: req.headers.referer || "",
      source: req.query?.source || "",
    });

    res.writeHead(302, { Location: link.destination_url });
    res.end();
  } catch (error) {
    console.error("trackClick error:", error);
    res.status(500).json({ error: error.message });
  }
}
