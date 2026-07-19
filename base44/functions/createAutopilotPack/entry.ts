import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function cleanCode(value) {
  return String(value || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 18) || 'product';
}

function uniqueCode(baseValue, existingCodes) {
  const base = `auto_${cleanCode(baseValue)}`;
  let code = base;
  let count = 2;
  while (existingCodes.has(code)) {
    code = `${base}_${count}`.slice(0, 28);
    count += 1;
  }
  existingCodes.add(code);
  return code;
}

function applyClickBankAffiliateId(value, affiliateId) {
  try {
    const url = new URL(value);
    if (url.hostname === 'hop.clickbank.net') {
      url.searchParams.set('affiliate', affiliateId);
      return url.toString();
    }
    if (url.hostname.endsWith('.hop.clickbank.net')) {
      const parts = url.hostname.split('.');
      parts[0] = affiliateId;
      url.hostname = parts.join('.');
      return url.toString();
    }
  } catch (_) {
    return value;
  }
  return value;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const niche = String(payload.niche || 'all').trim().slice(0, 80) || 'all';
    const allProducts = niche === 'all'
      ? await base44.entities.Product.list('-created_date', 200)
      : await base44.entities.Product.filter({ category: niche }, '-created_date', 200);

    const topProducts = [...allProducts]
      .sort((a, b) => (b.commission_rate || 0) - (a.commission_rate || 0))
      .slice(0, 3);

    if (topProducts.length === 0) {
      return Response.json({ error: 'No products found for that niche' }, { status: 400 });
    }

    const existingLinks = await base44.entities.AffiliateLink.list('-created_date', 500);
    const existingCodes = new Set(existingLinks.map((link) => link.short_code).filter(Boolean));
    const affiliateId = String(user.clickbank_nickname || 'amxalaska').trim() || 'amxalaska';
    const trustedAppOrigin = 'https://apx.amhere4utoday.com';
    const weekStartsAt = new Date().toISOString();
    const linkByKey = {};

    for (const product of topProducts) {
      for (let variant = 1; variant <= 3; variant += 1) {
        const campaignId = `autopilot:${product.id}:v${variant}`;
        let link = existingLinks.find((item) => item.product_id === product.id && item.campaign_id === campaignId);
        if (!link) {
          link = await base44.entities.AffiliateLink.create({
            product_id: product.id,
            product_name: product.name,
            destination_url: applyClickBankAffiliateId(product.url, affiliateId),
            short_code: uniqueCode(`${product.name}_${variant}`, existingCodes),
            campaign_id: campaignId,
            clicks: 0,
            conversions: 0,
            earnings: 0
          });
          existingLinks.push(link);
        }
        linkByKey[`${product.id}:${variant}`] = link;
      }

      const oldAutopilotPosts = await base44.entities.GeneratedPost.filter({
        autopilot_enabled: true,
        product_id: product.id,
        niche
      });
      for (const oldPost of oldAutopilotPosts) {
        await base44.entities.GeneratedPost.update(oldPost.id, {
          status: 'archived',
          autopilot_status: 'paused'
        });
      }
    }

    const productList = topProducts.map((product, index) => {
      const links = [1, 2, 3].map((variant) => {
        const link = linkByKey[`${product.id}:${variant}`];
        return `Variant ${variant} link: ${trustedAppOrigin}/functions/trackClick?code=${encodeURIComponent(link.short_code)}`;
      }).join('\n');
      return `${index}. ${product.name}\nNiche: ${product.category || niche}\nDescription: ${product.description || 'Useful product for everyday shoppers.'}\n${links}`;
    }).join('\n\n');

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      prompt: `Create simple, safe affiliate ads for a beginner-friendly autopilot flow.\n\nPRODUCTS:\n${productList}\n\nFor each product, create exactly 3 ad variants. Use the matching variant link inside that variant.\nRules:\n- Include this disclosure in every ad: "I may earn from qualifying purchases."\n- Be honest, plain-language, and helpful.\n- No income claims, medical claims, fake urgency, or exaggerated promises.\n- Each ad should feel different: helpful tip, personal recommendation, and quick deal-style.\n- Keep each ad under 900 characters.\n\nReturn product_index from the list and variant_number 1, 2, or 3.`, 
      response_json_schema: {
        type: 'object',
        properties: {
          ads: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_index: { type: 'number' },
                variant_number: { type: 'number' },
                content: { type: 'string' },
                hashtags: { type: 'string' },
                ai_score: { type: 'number' },
                ai_feedback: { type: 'string' }
              },
              required: ['product_index', 'variant_number', 'content']
            }
          }
        },
        required: ['ads']
      }
    });

    const ads = Array.isArray(result?.ads) ? result.ads : [];
    const records = ads.map((ad) => {
      const product = topProducts[Number(ad.product_index)];
      const variant = Math.max(1, Math.min(Number(ad.variant_number) || 1, 3));
      const link = product ? linkByKey[`${product.id}:${variant}`] : null;
      if (!product || !link || !ad.content) return null;
      return {
        link_id: link.id,
        product_id: product.id,
        product_name: product.name,
        platform: 'general',
        content: ad.content,
        hashtags: ad.hashtags || '#HelpfulDeals #AffiliateProX',
        tone: 'casual',
        status: variant === 1 ? 'posted' : 'draft',
        clicks: 0,
        conversions: 0,
        ai_score: ad.ai_score || 8,
        ai_feedback: ad.ai_feedback || 'Autopilot ad variation for testing.',
        trending_topics: product.category || niche,
        moderation_status: 'passed',
        moderation_notes: JSON.stringify({ source: 'createAutopilotPack', autopilot: true }),
        autopilot_enabled: true,
        autopilot_status: variant === 1 ? 'running' : 'queued',
        niche,
        variant_number: variant,
        scheduled_day: variant,
        last_selected_at: variant === 1 ? weekStartsAt : null,
        week_starts_at: weekStartsAt
      };
    }).filter(Boolean).slice(0, topProducts.length * 3);

    if (records.length === 0) {
      return Response.json({ error: 'No ads were generated. Please try again.' }, { status: 500 });
    }

    const created = await base44.entities.GeneratedPost.bulkCreate(records);
    return Response.json({ success: true, products: topProducts, posts: created, message: `Built autopilot ads for ${topProducts.length} products.` });
  } catch (error) {
    console.error('createAutopilotPack failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});