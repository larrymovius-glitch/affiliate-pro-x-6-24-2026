import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";
import { invokeLLM } from "./_lib/llm.js";
import { largestEbayImage } from "./_lib/images.js";
import { trendingKeepCheck } from "./_lib/trendingKeep.js";
import { affiliateUrlFor, getEbayAppToken, listingFacts, searchEbayItems } from "./_lib/ebay.js";

export { listingFacts };

async function searchTopEbayItem(token, campaignId, query) {
  return (await searchEbayItems(token, campaignId, query, { limit: 1 }))[0] || null;
}

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    if (user?.role !== "admin" && !cronOk) return res.status(403).json({ error: "Forbidden: Admin access or scheduled run required" });

    const D = db();
    let owner = user;
    if (!owner) {
      const admins = await D.User.filter({ role: "admin" });
      owner = admins[0];
    }
    if (!owner) return res.status(200).json({ success: false, message: "No admin user found" });

    const campaignId = owner.affiliate_network_ids?.ebay;
    if (!campaignId) {
      return res.status(400).json({ error: "No eBay Partner Network Campaign ID saved. Add it on the Networks page first." });
    }

    const token = await getEbayAppToken();

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

    // Resolve each suggested search term against eBay's real catalog -- the
    // LLM picks WHAT'S trending, eBay's own Browse API supplies the actual
    // item, its real URL, and a properly tracked affiliate link.
    const resolvedItems = [];
    for (const item of trendingResult.products || []) {
      if (!item.search_term) continue;
      const topItem = await searchTopEbayItem(token, campaignId, item.search_term);
      if (!topItem) continue;
      const url = affiliateUrlFor(topItem, campaignId);
      if (!url) continue;
      resolvedItems.push({
        name: topItem.title || item.name || item.search_term,
        category: item.category,
        url,
        image: largestEbayImage(topItem.image?.imageUrl || ""),
        facts: listingFacts(topItem),
      });
    }

    const added = [];
    const removed = [];

    const allLinks = await D.AffiliateLink.list("-created_at", 1000);
    const existingLinks = allLinks.filter((l) => (l.short_code || "").startsWith("ebay_trend_"));

    const newTrendingUrls = new Set(resolvedItems.map((r) => r.url));

    for (const link of existingLinks) {
      if (!newTrendingUrls.has(link.destination_url)) {
        const { reason, products } = await trendingKeepCheck(D, link, ["ebay_trending"]);
        if (reason) continue;
        await D.AffiliateLink.delete(link.id);
        for (const p of products) await D.Product.delete(p.id);
        removed.push(link.product_name);
      }
    }

    const existingLinkUrls = new Set(existingLinks.map((l) => l.destination_url));

    for (const r of resolvedItems) {
      if (existingLinkUrls.has(r.url)) continue;

      const existing = await D.Product.filter({ url: r.url });
      let productId;
      if (existing.length > 0) productId = existing[0].id;
      else {
        const product = await D.Product.create({
          created_by_id: owner.id,
          name: r.name,
          url: r.url,
          // The listing's own facts, so an ad script has something true to
          // say about condition and shipping instead of reaching for
          // "fast free shipping" on its own.
          description: [`eBay trending product — ${r.category || "general"}`, r.facts].filter(Boolean).join(". "),
          category: "ebay_trending",
          // products.network defaults to 'clickbank' too, the same trap the
          // link below sets its network to avoid.
          network: "ebay",
          image_url: r.image,
          commission_rate: 0,
        });
        productId = product.id;
      }

      // Letters and digits only: this becomes the /r/<code> path people share,
      // and a product name's apostrophes and ampersands ("Levi's", "B&W") make
      // for a link that breaks when pasted into a post.
      const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").substring(0, 15);
      await D.AffiliateLink.create({
        created_by_id: owner.id,
        product_id: productId,
        product_name: r.name,
        destination_url: r.url,
        // Set explicitly: affiliate_links.network defaults to 'clickbank', so
        // leaving it off labelled every eBay link a ClickBank one.
        network: "ebay",
        short_code: `ebay_trend_${slug}_${Math.random().toString(36).slice(2, 6)}`,
        clicks: 0, conversions: 0, earnings: 0,
      });
      added.push(r.name);
    }

    res.status(200).json({ success: true, added, removed, message: `eBay trending sync complete. Added: ${added.length}, Removed: ${removed.length}` });
  } catch (error) {
    console.error("syncEbayTrending failed:", error);
    res.status(500).json({ error: error.message });
  }
}
