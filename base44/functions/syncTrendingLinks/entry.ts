import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin or scheduled-run only (any user could previously trigger platform-wide deletions)
    const CRON_TOKEN = Deno.env.get("CRON_SECRET") || "apx_cron_8c41f2d97ab34e6f902d5e1b7c3a6f48";
    let payload = {};
    try { payload = await req.json(); } catch (_) { payload = {}; }
    const cronOk = payload.cron_secret === CRON_TOKEN || req.headers.get('x-cron-secret') === CRON_TOKEN;
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }
    if (user?.role !== 'admin' && !cronOk) {
      return Response.json({ error: 'Forbidden: Admin access or scheduled run required' }, { status: 403 });
    }

    // Owner for created records so they're visible under RLS
    let ownerId = user?.id;
    if (!ownerId) {
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      ownerId = admins[0]?.id;
    }

    // Fetch trending products for ClickBank and Digistore24 via LLM + web search
    const trendingResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are an affiliate marketing expert. Search the web right now for the TOP 5 CURRENTLY TRENDING products on ClickBank and TOP 5 on Digistore24.

For ClickBank: Find products with the highest gravity scores and best conversions right now. Return the vendor nickname (the part used in HopLinks like https://affiliate.vendor.hop.clickbank.net).

For Digistore24: Find the top converting / best-selling products right now. Return the product ID (the numeric ID used in affiliate links like https://www.digistore24.com/redir/PRODUCTID/Here_4you/).

Return ONLY real, verified products that are currently trending. Do NOT make up vendor names or product IDs.

Return JSON in this exact format:
{
  "clickbank": [
    {"vendor": "vendorname", "name": "Product Display Name", "category": "health|wealth|relationships|other"}
  ],
  "digistore24": [
    {"product_id": "123456", "name": "Product Display Name", "category": "health|wealth|relationships|other"}
  ]
}`,
      add_context_from_internet: true,
      model: "gemini_3_1_pro",
      response_json_schema: {
        type: "object",
        properties: {
          clickbank: {
            type: "array",
            items: {
              type: "object",
              properties: {
                vendor: { type: "string" },
                name: { type: "string" },
                category: { type: "string" }
              }
            }
          },
          digistore24: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                name: { type: "string" },
                category: { type: "string" }
              }
            }
          }
        }
      }
    });

    const cbNickname = "apxalaska";
    const ds24Affiliate = "Here_4you";
    const added = [];
    const removed = [];

    // --- Build the new desired set of trending link destination URLs ---
    const newTrendingUrls = new Set();

    for (const item of (trendingResult.clickbank || [])) {
      if (!item.vendor) continue;
      const url = `https://${cbNickname}.${item.vendor.trim().toLowerCase()}.hop.clickbank.net`;
      newTrendingUrls.add(url);
    }
    for (const item of (trendingResult.digistore24 || [])) {
      if (!item.product_id) continue;
      const url = `https://www.digistore24.com/redir/${item.product_id}/Here_4you/`;
      newTrendingUrls.add(url);
    }

    // --- Fetch existing trending-tagged links ---
    const existingLinks = await base44.asServiceRole.entities.AffiliateLink.filter({ short_code: { $regex: "^trend_" } });

    // Remove links that are no longer trending — but never delete links with earnings (history feeds payouts)
    for (const link of existingLinks) {
      if (!newTrendingUrls.has(link.destination_url)) {
        if ((link.earnings || 0) > 0) continue;
        await base44.asServiceRole.entities.AffiliateLink.delete(link.id);
        // Also delete the product if it was auto-created for trending
        const products = await base44.asServiceRole.entities.Product.filter({ url: link.destination_url, category: { $in: ["clickbank_trending", "digistore24_trending"] } });
        for (const p of products) {
          await base44.asServiceRole.entities.Product.delete(p.id);
        }
        removed.push(link.product_name);
      }
    }

    const existingLinkUrls = new Set(existingLinks.map(l => l.destination_url));

    // Add new trending links for ClickBank
    for (const item of (trendingResult.clickbank || [])) {
      if (!item.vendor) continue;
      const vendor = item.vendor.trim().toLowerCase();
      const hopLink = `https://${cbNickname}.${vendor}.hop.clickbank.net`;
      if (existingLinkUrls.has(hopLink)) continue; // already exists

      const existing = await base44.asServiceRole.entities.Product.filter({ url: hopLink });
      let productId;
      if (existing.length > 0) {
        productId = existing[0].id;
      } else {
        const product = await base44.asServiceRole.entities.Product.create({
          created_by_id: ownerId,
          name: item.name || vendor,
          url: hopLink,
          description: `ClickBank trending product — vendor: ${vendor}`,
          category: "clickbank_trending",
        });
        productId = product.id;
      }
      await base44.asServiceRole.entities.AffiliateLink.create({
        created_by_id: ownerId,
        product_id: productId,
        product_name: item.name || vendor,
        destination_url: hopLink,
        short_code: `trend_cb_${vendor}`,
        clicks: 0, conversions: 0, earnings: 0,
      });
      added.push(item.name || vendor);
    }

    // Add new trending links for Digistore24
    for (const item of (trendingResult.digistore24 || [])) {
      if (!item.product_id) continue;
      const dsUrl = `https://www.digistore24.com/redir/${item.product_id}/${ds24Affiliate}/`;
      if (existingLinkUrls.has(dsUrl)) continue;

      const existing = await base44.asServiceRole.entities.Product.filter({ url: dsUrl });
      let productId;
      if (existing.length > 0) {
        productId = existing[0].id;
      } else {
        const product = await base44.asServiceRole.entities.Product.create({
          created_by_id: ownerId,
          name: item.name || `DS24 Product ${item.product_id}`,
          url: dsUrl,
          description: `Digistore24 trending product — ID: ${item.product_id}`,
          category: "digistore24_trending",
        });
        productId = product.id;
      }
      await base44.asServiceRole.entities.AffiliateLink.create({
        created_by_id: ownerId,
        product_id: productId,
        product_name: item.name || `DS24 Product ${item.product_id}`,
        destination_url: dsUrl,
        short_code: `trend_ds_${item.product_id}`,
        clicks: 0, conversions: 0, earnings: 0,
      });
      added.push(item.name || `DS24 ${item.product_id}`);
    }

    return Response.json({
      success: true,
      added,
      removed,
      message: `Trending sync complete. Added: ${added.length}, Removed: ${removed.length}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});