import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let payload = {};
    try {
      payload = await req.json();
    } catch (_) {
      payload = {};
    }

    const productLimit = Math.max(1, Math.min(Number(payload.limit) || 5, 5));

    const ebayProducts = await base44.asServiceRole.entities.Product.filter({
      category: "ebay_trending"
    });

    if (!ebayProducts || ebayProducts.length === 0) {
      return Response.json({
        success: false,
        message: "No eBay trending products found. Run syncEbayTrending first."
      });
    }

    const selectedProducts = ebayProducts.slice(0, productLimit);
    const productList = selectedProducts.map((product, index) => (
      `${index}. ${product.name}\nURL: ${product.url}\nDescription: ${product.description || "No description provided"}`
    )).join("\n\n");

    const postResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: "gemini_3_flash",
      prompt: `Create safe, FTC-compliant affiliate social media posts for these eBay trending products.

PRODUCTS:
${productList}

For EACH product, create exactly 4 posts: facebook, instagram, tiktok, and twitter.

Safety rules:
- Include this disclosure in every post: "As an eBay partner I earn from qualifying purchases."
- Do not make income, medical, miracle, fake urgency, MLM, or exaggerated claims.
- Keep language professional, honest, and platform-safe.
- Focus on product value, savings, usefulness, and budget-conscious shopping.
- Twitter content must stay under 280 characters including disclosure.

Return one item per product/platform pair. Use the exact product_index from the product list above.`,
      response_json_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_index: { type: "number" },
                platform: { type: "string", enum: ["facebook", "instagram", "tiktok", "twitter"] },
                content: { type: "string" },
                hashtags: { type: "string" }
              },
              required: ["product_index", "platform", "content"]
            }
          }
        },
        required: ["items"]
      }
    });

    const allowedPlatforms = new Set(["facebook", "instagram", "tiktok", "twitter"]);
    const items = Array.isArray(postResult?.items) ? postResult.items : [];

    const records = items
      .map((item) => {
        const product = selectedProducts[Number(item.product_index)];
        if (!product || !allowedPlatforms.has(item.platform) || !item.content) return null;

        return {
          link_id: product.id,
          product_name: product.name,
          platform: item.platform,
          content: item.content,
          hashtags: item.hashtags || "",
          tone: "inspiring",
          status: "draft",
          clicks: 0,
          conversions: 0,
          ai_score: 8.0,
          ai_feedback: "AI-generated platform-safe draft with affiliate disclosure",
          trending_topics: product.category || "trending",
          moderation_status: "passed",
          moderation_notes: JSON.stringify({ automated: true, source: "generateEbayPosts" })
        };
      })
      .filter(Boolean)
      .slice(0, productLimit * 4);

    if (records.length === 0) {
      return Response.json({
        success: false,
        message: "No posts were generated. Please try again."
      });
    }

    await base44.asServiceRole.entities.GeneratedPost.bulkCreate(records);

    return Response.json({
      success: true,
      message: `Generated ${records.length} posts from ${selectedProducts.length} eBay products`,
      generated: records.map((record) => ({
        product: record.product_name,
        platform: record.platform,
        status: record.status,
        moderation: record.moderation_status
      }))
    });
  } catch (error) {
    console.error("generateEbayPosts failed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});