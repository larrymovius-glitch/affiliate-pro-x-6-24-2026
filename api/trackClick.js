import { db, incrementLinkStats } from "./_lib/db.js";
import { applyTrackingCode } from "./_lib/tracking.js";
import { isAutomatedVisit } from "./_lib/bots.js";

// Public click tracker. Reachable at /r/<short_code> (the link we ask people
// to share), and at /api/trackClick?code=<short_code> and the legacy
// /functions/trackClick path, both via vercel.json rewrites.
//
// The redirect carries the short code onward as the network's tracking id --
// that is what lets the network name this link when it posts a sale back to
// /api/trackConversion.
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

    // Preview crawlers and scripts are redirected like anyone else -- a
    // Facebook post's link card is drawn by following this link -- but they
    // are not people, so they are not counted. See api/_lib/bots.js.
    if (!isAutomatedVisit(req)) {
      await incrementLinkStats(link.id, { clicks: 1 });

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
    }

    const destination = applyTrackingCode(link.destination_url, link.short_code, link.network);
    res.writeHead(302, { Location: destination });
    res.end();
  } catch (error) {
    console.error("trackClick error:", error);
    res.status(500).json({ error: error.message });
  }
}
