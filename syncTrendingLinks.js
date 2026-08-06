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
      prompt: `You are an affiliate marketing expert. Search the web right now for the TOP 5 CURRENTLY TRENDING products on ClickBank and TOP 5 on Digistore24.

For ClickBank: Find products with the highest gravity scores and best conversions right now. Return the vendor nickname (the part used in HopLinks like https://affiliate.vendor.hop.clickbank.net).

For Digistore24: Find the top converting / best-selling products right now. Return the product ID (the numeric ID used in affiliate links like https://www.digistore24.com/redir/PRODUCTID/Here_4you/).

Return ONLY real, verified products that are currently trending. Do NOT make up vendor names or product IDs.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          clickbank: { type: "array", items: { type: "object", properties: { vendor: { type: "string" }, name: { type: "string" }, category: { type: "string" } } } },
          digistore24: { type: "array", items: { type: "object", properties: { product_id: { type: "string" }, name: { type: "string" }, category: { type: "string" } } } },
        },
      },
    });

    const cbNickname = "apxalaska";
    const ds24Affiliate = "Here_4you";
    const added = [];
    const removed = [];

    const newTrendingUrls = new Set();
    for (const item of trendingResult.clickbank || []) {
      if (!item.vendor) continue;
      newTrendingUrls.add(`https://${cbNickname}.${item.vendor.trim().toLowerCase()}.hop.clickbank.net`);
    }
    for (const item of trendingResult.digistore24 || []) {
      if (!item.product_id) continue;
      newTrendingUrls.add(`https://www.digistore24.com/redir/${item.product_id}/Here_4you/`);
    }

    const existingLinks = await D.AffiliateLink.filter({ short_code: { $regex: "^trend_" } });

    for (const link of existingLinks) {
      if (!newTrendingUrls.has(link.destination_url)) {
        if ((link.earnings || 0) > 0) continue;
        await D.AffiliateLink.delete(link.id);
        const products = await D.Product.filter({ url: link.destination_url, category: { $in: ["clickbank_trending", "digistore24_trending"] } });
        for (const p of products) await D.Product.delete(p.id);
        removed.push(link.product_name);
      }
    }

    const existingLinkUrls = new Set(existingLinks.map((l) => l.destination_url));

    for (const item of trendingResult.clickbank || []) {
      if (!item.vendor) continue;
      const vendor = item.vendor.trim().toLowerCase();
      const hopLink = `https://${cbNickname}.${vendor}.hop.clickbank.net`;
      if (existingLinkUrls.has(hopLink)) continue;

      const existing = await D.Product.filter({ url: hopLink });
      let productId;
      if (existing.length > 0) productId = existing[0].id;
      else {
        const product = await D.Product.create({ created_by_id: ownerId, name: item.name || vendor, url: hopLink, description: `ClickBank trending product — vendor: ${vendor}`, category: "clickbank_trending" });
        productId = product.id;
      }
      await D.AffiliateLink.create({ created_by_id: ownerId, product_id: productId, product_name: item.name || vendor, destination_url: hopLink, short_code: `trend_cb_${vendor}`, clicks: 0, conversions: 0, earnings: 0 });
      added.push(item.name || vendor);
    }

    for (const item of trendingResult.digistore24 || []) {
      if (!item.product_id) continue;
      const dsUrl = `https://www.digistore24.com/redir/${item.product_id}/${ds24Affiliate}/`;
      if (existingLinkUrls.has(dsUrl)) continue;

      const existing = await D.Product.filter({ url: dsUrl });
      let productId;
      if (existing.length > 0) productId = existing[0].id;
      else {
        const product = await D.Product.create({ created_by_id: ownerId, name: item.name || `DS24 Product ${item.product_id}`, url: dsUrl, description: `Digistore24 trending product — ID: ${item.product_id}`, category: "digistore24_trending" });
        productId = product.id;
      }
      await D.AffiliateLink.create({ created_by_id: ownerId, product_id: productId, product_name: item.name || `DS24 Product ${item.product_id}`, destination_url: dsUrl, short_code: `trend_ds_${item.product_id}`, clicks: 0, conversions: 0, earnings: 0 });
      added.push(item.name || `DS24 ${item.product_id}`);
    }

    res.status(200).json({ success: true, added, removed, message: `Trending sync complete. Added: ${added.length}, Removed: ${removed.length}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
