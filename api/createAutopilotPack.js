import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";
import { invokeLLM } from "./_lib/llm.js";

function cleanCode(v) { return String(v || "product").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18) || "product"; }
function uniqueCode(base, existing) {
  const b = `auto_${cleanCode(base)}`;
  let code = b, count = 2;
  while (existing.has(code)) { code = `${b}_${count}`.slice(0, 28); count += 1; }
  existing.add(code);
  return code;
}
function applyClickBankAffiliateId(value, affiliateId) {
  try {
    const url = new URL(value);
    if (url.hostname === "hop.clickbank.net") { url.searchParams.set("affiliate", affiliateId); return url.toString(); }
    if (url.hostname.endsWith(".hop.clickbank.net")) {
      const parts = url.hostname.split(".");
      parts[0] = affiliateId;
      url.hostname = parts.join(".");
      return url.toString();
    }
  } catch (_) { return value; }
  return value;
}

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const D = db();
    const payload = req.body || {};
    const niche = String(payload.niche || "all").trim().slice(0, 80) || "all";
    const allProducts =
      niche === "all"
        ? await D.Product.filter({ created_by_id: user.id }, "-created_date", 200)
        : await D.Product.filter({ created_by_id: user.id, category: niche }, "-created_date", 200);

    const topProducts = [...allProducts].sort((a, b) => (b.commission_rate || 0) - (a.commission_rate || 0)).slice(0, 3);
    if (topProducts.length === 0) return res.status(400).json({ error: "No products found for that niche" });

    const existingLinks = await D.AffiliateLink.filter({ created_by_id: user.id }, "-created_date", 500);
    const existingCodes = new Set(existingLinks.map((l) => l.short_code).filter(Boolean));
    const affiliateId = String(user.clickbank_nickname || "apxalaska").trim() || "apxalaska";
    const trustedAppOrigin = `https://${req.headers.host}`;
    const weekStartsAt = new Date().toISOString();
    const linkByKey = {};

    for (const product of topProducts) {
      for (let variant = 1; variant <= 3; variant += 1) {
        const campaignId = `autopilot:${product.id}:v${variant}`;
        let link = existingLinks.find((l) => l.product_id === product.id && l.campaign_id === campaignId);
        if (!link) {
          link = await D.AffiliateLink.create({
            created_by_id: user.id,
            product_id: product.id,
            product_name: product.name,
            destination_url: applyClickBankAffiliateId(product.url, affiliateId),
            short_code: uniqueCode(`${product.name}_${variant}`, existingCodes),
            campaign_id: campaignId,
            clicks: 0, conversions: 0, earnings: 0,
          });
          existingLinks.push(link);
        }
        linkByKey[`${product.id}:${variant}`] = link;
      }

      const oldAutopilotPosts = await D.GeneratedPost.filter({ created_by_id: user.id, autopilot_enabled: true, product_id: product.id, niche });
      for (const oldPost of oldAutopilotPosts) {
        await D.GeneratedPost.update(oldPost.id, { status: "archived", autopilot_status: "paused" });
      }
    }

    const productList = topProducts
      .map((product, index) => {
        const links = [1, 2, 3]
          .map((variant) => `Variant ${variant} link: ${trustedAppOrigin}/functions/trackClick?code=${encodeURIComponent(linkByKey[`${product.id}:${variant}`].short_code)}`)
          .join("\n");
        return `${index}. ${product.name}\nNiche: ${product.category || niche}\nDescription: ${product.description || "Useful product for everyday shoppers."}\n${links}`;
      })
      .join("\n\n");

    const result = await invokeLLM({
      prompt: `Create simple, safe affiliate ads for a beginner-friendly autopilot flow.\n\nPRODUCTS:\n${productList}\n\nFor each product, create exactly 3 ad variants. Use the matching variant link inside that variant.\nRules:\n- Include this disclosure in every ad: "I may earn from qualifying purchases."\n- Be honest, plain-language, and helpful.\n- No income claims, medical claims, fake urgency, or exaggerated promises.\n- Each ad should feel different: helpful tip, personal recommendation, and quick deal-style.\n- Keep each ad under 900 characters.\n\nReturn product_index from the list and variant_number 1, 2, or 3.`,
      response_json_schema: {
        type: "object",
        properties: {
          ads: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_index: { type: "number" },
                variant_number: { type: "number" },
                content: { type: "string" },
                hashtags: { type: "string" },
                ai_score: { type: "number" },
                ai_feedback: { type: "string" },
              },
              required: ["product_index", "variant_number", "content"],
            },
          },
        },
        required: ["ads"],
      },
    });

    const ads = Array.isArray(result?.ads) ? result.ads : [];
    const records = ads
      .map((ad) => {
        const product = topProducts[Number(ad.product_index)];
        const variant = Math.max(1, Math.min(Number(ad.variant_number) || 1, 3));
        const link = product ? linkByKey[`${product.id}:${variant}`] : null;
        if (!product || !link || !ad.content) return null;
        return {
          created_by_id: user.id,
          link_id: link.id,
          product_id: product.id,
          product_name: product.name,
          platform: "general",
          content: ad.content,
          hashtags: ad.hashtags || "#HelpfulDeals #AffiliateProX",
          tone: "casual",
          status: variant === 1 ? "posted" : "draft",
          clicks: 0,
          conversions: 0,
          ai_score: ad.ai_score || 8,
          ai_feedback: ad.ai_feedback || "Autopilot ad variation for testing.",
          trending_topics: product.category || niche,
          moderation_status: "passed",
          moderation_notes: JSON.stringify({ source: "createAutopilotPack", autopilot: true }),
          autopilot_enabled: true,
          autopilot_status: variant === 1 ? "running" : "queued",
          niche,
          variant_number: variant,
          scheduled_day: variant,
          last_selected_at: variant === 1 ? weekStartsAt : null,
          week_starts_at: weekStartsAt,
        };
      })
      .filter(Boolean)
      .slice(0, topProducts.length * 3);

    if (records.length === 0) return res.status(500).json({ error: "No ads were generated. Please try again." });

    const created = await D.GeneratedPost.bulkCreate(records);
    res.status(200).json({ success: true, products: topProducts, posts: created, message: `Built autopilot ads for ${topProducts.length} products.` });
  } catch (error) {
    console.error("createAutopilotPack failed:", error);
    res.status(500).json({ error: error.message });
  }
}
