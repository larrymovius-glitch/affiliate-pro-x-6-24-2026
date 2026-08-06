import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";
import { invokeLLM } from "./_lib/llm.js";

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    if (user?.role !== "admin" && !cronOk) return res.status(403).json({ error: "Forbidden: Admin access or scheduled run required" });

    const D = db();
    let ownerId = user?.id;
    if (!ownerId) {
      const admins = await D.User.filter({ role: "admin" });
      ownerId = admins[0]?.id;
    }

    const trendingResult = await invokeLLM({
      prompt: `You are an eBay affiliate marketing expert. Search the web right now for the TOP 10 TRENDING PRODUCTS on eBay that have high affiliate commissions.

Focus on products that:
- Have high demand and good conversion rates
- Are in popular categories (electronics, home & garden, fashion, collectibles, health)
- Have good affiliate commission potential
- Are currently trending or seasonal

For each product, find the eBay product name, category, and a relevant search term to find it on eBay.

Return ONLY real, verified products that are currently trending on eBay. Do NOT make up product names.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string" }, category: { type: "string" }, search_term: { type: "string" } } },
          },
        },
      },
    });

    const cbNickname = "apxalaska";
    const added = [];
    const removed = [];

    const allLinks = await D.AffiliateLink.list("-created_date", 1000);
    const existingLinks = allLinks.filter((l) => (l.short_code || "").startsWith("ebay_trend_"));

    const newTrendingUrls = new Set();
    for (const item of trendingResult.products || []) {
      if (!item.search_term) continue;
      newTrendingUrls.add(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.search_term)}&_sacat=0&_oddm=2&_ssn=${cbNickname}`);
    }

    for (const link of existingLinks) {
      if (!newTrendingUrls.has(link.destination_url)) {
        if ((link.earnings || 0) > 0) continue;
        await D.AffiliateLink.delete(link.id);
        const products = await D.Product.filter({ url: link.destination_url, category: "ebay_trending" });
        for (const p of products) await D.Product.delete(p.id);
        removed.push(link.product_name);
      }
    }

    const existingLinkUrls = new Set(existingLinks.map((l) => l.destination_url));

    for (const item of trendingResult.products || []) {
      if (!item.search_term) continue;
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.search_term)}&_sacat=0&_oddm=2&_ssn=${cbNickname}`;
      if (existingLinkUrls.has(url)) continue;

      const existing = await D.Product.filter({ url });
      let productId;
      if (existing.length > 0) productId = existing[0].id;
      else {
        const product = await D.Product.create({
          created_by_id: ownerId,
          name: item.name || item.search_term,
          url,
          description: `eBay trending product — ${item.category}`,
          category: "ebay_trending",
          image_url: "",
          commission_rate: 0,
        });
        productId = product.id;
      }

      await D.AffiliateLink.create({
        created_by_id: ownerId,
        product_id: productId,
        product_name: item.name || item.search_term,
        destination_url: url,
        short_code: `ebay_trend_${item.search_term.replace(/\s+/g, "_").toLowerCase().substring(0, 15)}`,
        clicks: 0, conversions: 0, earnings: 0,
      });
      added.push(item.name || item.search_term);
    }

    res.status(200).json({ success: true, added, removed, message: `eBay trending sync complete. Added: ${added.length}, Removed: ${removed.length}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
