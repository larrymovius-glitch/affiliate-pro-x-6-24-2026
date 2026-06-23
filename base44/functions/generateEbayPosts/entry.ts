import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch eBay trending products
    const ebayProducts = await base44.asServiceRole.entities.Product.filter({ 
      category: "ebay_trending" 
    });

    if (!ebayProducts || ebayProducts.length === 0) {
      return Response.json({ 
        success: false, 
        message: "No eBay trending products found. Run syncEbayTrending first." 
      });
    }

    const generated = [];

    for (const product of ebayProducts.slice(0, 5)) { // Generate for top 5 products
      // Generate social posts for each platform
      const postResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are an expert affiliate marketer creating HIGH-CONVERTING social media posts for eBay products.

PRODUCT: ${product.name}
CATEGORY: ${product.category || "general"}
AFFILIATE LINK: ${product.url}

Create 4 different social media posts (one for each platform):

1. **FACEBOOK** (engaging, story-driven, 150-200 words)
2. **INSTAGRAM** (visual-focused, emoji-rich, 100-150 words + 15 hashtags)
3. **TIKTOK** (hook-first, casual, Gen-Z friendly, 80-120 words)
4. **TWITTER** (concise, punchy, under 280 characters)

REQUIREMENTS:
- Each post must include a strong HOOK in the first sentence
- Include a clear CALL TO ACTION (e.g., "Click the link", "Shop now", "Don't miss out")
- Use power words: Amazing, Incredible, Limited, Exclusive, Must-Have, Deal, Steal
- Include FTC disclosure: "As an eBay partner I earn from qualifying purchases"
- Make it urgent and compelling for disabled veterans and budget-conscious buyers
- Focus on VALUE and SAVINGS

Return JSON in this exact format:
{
  "facebook": {
    "content": "...",
    "hashtags": "#ebay #deals #shopping ..."
  },
  "instagram": {
    "content": "...",
    "hashtags": "#ebayfinds #deals #shopping ..."
  },
  "tiktok": {
    "content": "...",
    "hashtags": "#ebaytok #deals #shopping ..."
  },
  "twitter": {
    "content": "...",
    "hashtags": "#ebay #deals"
  }
}`,
        model: "gemini_3_1_pro",
        response_json_schema: {
          type: "object",
          properties: {
            facebook: {
              type: "object",
              properties: {
                content: { type: "string" },
                hashtags: { type: "string" }
              }
            },
            instagram: {
              type: "object",
              properties: {
                content: { type: "string" },
                hashtags: { type: "string" }
              }
            },
            tiktok: {
              type: "object",
              properties: {
                content: { type: "string" },
                hashtags: { type: "string" }
              }
            },
            twitter: {
              type: "object",
              properties: {
                content: { type: "string" },
                hashtags: { type: "string" }
              }
            }
          }
        }
      });

      // Save posts to GeneratedPost entity
      const platforms = ['facebook', 'instagram', 'tiktok', 'twitter'];
      for (const platform of platforms) {
        const postData = postResult[platform];
        if (!postData) continue;

        await base44.asServiceRole.entities.GeneratedPost.create({
          link_id: product.id,
          product_name: product.name,
          platform: platform,
          content: postData.content,
          hashtags: postData.hashtags || "",
          tone: "inspiring",
          status: "draft",
          clicks: 0,
          conversions: 0,
          ai_score: 8.5,
          ai_feedback: "AI-generated high-converting post with strong hook and CTA",
          trending_topics: product.category || "trending"
        });

        generated.push({
          product: product.name,
          platform,
          status: "draft"
        });
      }
    }

    return Response.json({
      success: true,
      message: `Generated ${generated.length} posts from ${ebayProducts.length} eBay products`,
      generated
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});