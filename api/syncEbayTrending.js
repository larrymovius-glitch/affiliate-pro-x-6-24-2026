import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";
import { invokeLLM } from "./_lib/llm.js";
import { largestEbayImage } from "./_lib/images.js";

const EBAY_API_BASE = "https://api.ebay.com";

// App-level OAuth (client_credentials) -- separate from a user's own eBay
// login. This is all the Browse API needs; it doesn't require anyone to
// "connect an eBay account".
async function getEbayAppToken() {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) throw new Error("eBay is not configured (missing EBAY_APP_ID or EBAY_CERT_ID)");

  const res = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || "Failed to authenticate with eBay");
  return data.access_token;
}

// Passing the campaign id via X-EBAY-C-ENDUSERCTX makes eBay return
// itemAffiliateWebUrl pre-tracked; campid is appended manually as a fallback
// for the rare item that doesn't carry that field.
async function searchTopEbayItem(token, campaignId, query) {
  const url = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${campaignId}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.itemSummaries?.[0] || null;
}

function affiliateUrlFor(item, campaignId) {
  if (item.itemAffiliateWebUrl) return item.itemAffiliateWebUrl;
  if (!item.itemWebUrl) return null;
  const sep = item.itemWebUrl.includes("?") ? "&" : "?";
  return `${item.itemWebUrl}${sep}campid=${encodeURIComponent(campaignId)}`;
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
      });
    }

    const added = [];
    const removed = [];

    const allLinks = await D.AffiliateLink.list("-created_at", 1000);
    const existingLinks = allLinks.filter((l) => (l.short_code || "").startsWith("ebay_trend_"));

    const newTrendingUrls = new Set(resolvedItems.map((r) => r.url));

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
          description: `eBay trending product — ${r.category || "general"}`,
          category: "ebay_trending",
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
