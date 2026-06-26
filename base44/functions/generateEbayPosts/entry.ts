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

    for (const product of ebayProducts.slice(0, 2)) { // Keep assistant-triggered generation fast on mobile
      // Generate social posts for each platform WITH SAFETY CONSTRAINTS
      const postResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are an expert affiliate marketer creating HIGH-CONVERTING but SAFE social media posts for eBay products.

⚠️ CRITICAL: Follow ALL platform community standards. DO NOT create content that could get accounts banned:

**STRICT RULES:**
1. NO income claims ("Make $500/day", "Get rich quick") — focus on PRODUCT VALUE, not earnings
2. NO medical claims ("Cures pain", "Miracle solution") — use "may help", "customers report"
3. NO spammy language — limit emojis to 3-5, NO excessive caps or "CLICK NOW!!!"
4. NO fake urgency — don't say "Last chance!" unless it's actually ending
5. NO before/after claims without clear disclaimers
6. NO MLM/pyramid language ("Join my team", "Recruit others")
7. Be honest and transparent — FTC compliance required
8. Include affiliate disclosure: "As an eBay partner I earn from qualifying purchases"

Your posts must be PROFESSIONAL, HONEST, and PLATFORM-SAFE.

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
        model: "gemini_3_flash",
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

      // Step 2: Moderate EACH post before saving
      const platforms = ['facebook', 'instagram', 'tiktok', 'twitter'];
      for (const platform of platforms) {
        const postData = postResult[platform];
        if (!postData) continue;

        // Run content moderation
        const moderation = await base44.asServiceRole.functions.invoke('moderateContent', {
          content: postData.content,
          platform: platform
        });

        const modData = moderation.data;

        // Auto-reject HIGH/CRITICAL risk content
        if (modData.overall_risk === 'high' || modData.overall_risk === 'critical') {
          console.log(`❌ Rejected ${platform} post for ${product.name}: ${modData.violations?.length || 0} violations`);
          continue; // Skip this post
        }

        // Use safe version if rewrite recommended
        const finalContent = modData.recommendation === 'rewrite' && modData.safe_version 
          ? modData.safe_version 
          : postData.content;

        await base44.asServiceRole.entities.GeneratedPost.create({
          link_id: product.id,
          product_name: product.name,
          platform: platform,
          content: finalContent,
          hashtags: postData.hashtags || "",
          tone: "inspiring",
          status: "draft",
          clicks: 0,
          conversions: 0,
          ai_score: modData.is_safe ? 8.5 : 6.0,
          ai_feedback: modData.is_safe 
            ? "AI-generated high-converting post with strong hook and CTA" 
            : `Moderated: ${modData.violations?.length || 0} issues fixed`,
          trending_topics: product.category || "trending",
          moderation_status: modData.is_safe ? 'passed' : 'modified',
          moderation_notes: JSON.stringify(modData)
        });

        generated.push({
          product: product.name,
          platform,
          status: "draft",
          moderation: modData.recommendation
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