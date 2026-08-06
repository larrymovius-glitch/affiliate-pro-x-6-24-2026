import { db } from "./_lib/db.js";

// Secure conversion postback: /api/trackConversion?secret=...&code=...&amount=...
// Networks (ClickBank, Digistore24, etc.) call this when a sale happens.
export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const secret = req.query?.secret || body.secret;
    const expected = process.env.CONVERSION_SECRET;
    if (!secret || !expected || secret !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const code = req.query?.code || body.code;
    // Networks send a test ping with unsubstituted placeholders (e.g. "[tid]")
    // when the URL is first saved. Respond 200 so the URL validates.
    if (!code || code.includes("[") || code.includes("{")) {
      console.log("Test ping or missing code — responding OK. code:", code);
      return res.status(200).send("OK");
    }

    const rawAmount = req.query?.amount || body.amount || 0;
    const amount = Number(rawAmount);
    const safeAmount = Number.isNaN(amount) || amount < 0 ? 0 : amount;

    const D = db();
    const links = await D.AffiliateLink.filter({ short_code: code });
    if (!links.length) {
      console.warn("Conversion received for unknown code:", code);
      return res.status(200).send("OK");
    }

    const link = links[0];
    const now = new Date().toISOString();
    await D.AffiliateLink.update(link.id, {
      conversions: (link.conversions || 0) + 1,
      earnings: (link.earnings || 0) + safeAmount,
    });

    await D.ConversionEvent.create({
      created_by_id: link.created_by_id,
      owner_user_id: link.created_by_id,
      link_id: link.id,
      short_code: link.short_code,
      product_name: link.product_name || "",
      amount: safeAmount,
      converted_at: now,
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("trackConversion error:", error);
    res.status(500).json({ error: error.message });
  }
}
