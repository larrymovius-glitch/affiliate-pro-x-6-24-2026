import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Step 1: Use LLM to find trending eBay products
    const trendingResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are an eBay affiliate marketing expert. Search the web right now for the TOP 10 TRENDING PRODUCTS on eBay that have high affiliate commissions.

Focus on products that:
- Have high demand and good conversion rates
- Are in popular categories (electronics, home & garden, fashion, collectibles, health)
- Have good affiliate commission potential
- Are currently trending or seasonal

For each product, find:
- The eBay product name
- The eBay category
- A relevant search term or product identifier that can be used to find it on eBay

Return JSON in this exact format:
{
  "products": [
    {
      "name": "Product Display Name",
      "category": "electronics|home|fashion|collectibles|health|other",
      "search_term": "specific search term to find this product on eBay"
    }
  ]
}

Return ONLY real, verified products that are currently trending on eBay. Do NOT make up product names.`,
      add_context_from_internet: true,
      model: "gemini_3_1_pro",
      response_json_schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                category: { type: "string" },
                search_term: { type: "string" }
              }
            }
          }
        }
      }
    });

    const cbNickname = "amxalaska";
    const added = [];
    const removed = [];

    // Fetch existing eBay trending links
    const existingLinks = await base44.asServiceRole.entities.AffiliateLink.filter({ 
      short_code: { $regex: "^ebay_trend_" } 
    });

    // Build new trending URLs
    const newTrendingUrls = new Set();
    for (const item of (trendingResult.products || [])) {
      if (!item.search_term) continue;
      // Create eBay search URL with affiliate tracking
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.search_term)}&_sacat=0&_oddm=2&_ssn=${cbNickname}`;
      newTrendingUrls.add(url);
    }

    // Remove links that are no longer trending
    for (const link of existingLinks) {
      if (!newTrendingUrls.has(link.destination_url)) {
        await base44.asServiceRole.entities.AffiliateLink.delete(link.id);
        const products = await base44.asServiceRole.entities.Product.filter({ 
          url: link.destination_url, 
          category: "ebay_trending" 
        });
        for (const p of products) {
          await base44.asServiceRole.entities.Product.delete(p.id);
        }
        removed.push(link.product_name);
      }
    }

    const existingLinkUrls = new Set(existingLinks.map(l => l.destination_url));

    // Add new trending eBay links
    for (const item of (trendingResult.products || [])) {
      if (!item.search_term) continue;
      
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.search_term)}&_sacat=0&_oddm=2&_ssn=${cbNickname}`;
      if (existingLinkUrls.has(url)) continue;

      const existing = await base44.asServiceRole.entities.Product.filter({ url });
      let productId;
      if (existing.length > 0) {
        productId = existing[0].id;
      } else {
        const product = await base44.asServiceRole.entities.Product.create({
          name: item.name || item.search_term,
          url,
          description: `eBay trending product — ${item.category}`,
          category: "ebay_trending",
          image_url: "",
          commission_rate: 0
        });
        productId = product.id;
      }

      await base44.asServiceRole.entities.AffiliateLink.create({
        product_id: productId,
        product_name: item.name || item.search_term,
        destination_url: url,
        short_code: `ebay_trend_${item.search_term.replace(/\s+/g, "_").toLowerCase().substring(0, 15)}`,
        clicks: 0,
        conversions: 0,
        earnings: 0
      });
      added.push(item.name || item.search_term);
    }

    return Response.json({
      success: true,
      added,
      removed,
      message: `eBay trending sync complete. Added: ${added.length}, Removed: ${removed.length}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});