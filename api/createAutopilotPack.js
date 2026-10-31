import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";
import { invokeLLM } from "./_lib/llm.js";
import { destinationForUser } from "./_lib/affiliates.js";
import { networkForDestination } from "./_lib/tracking.js";

function cleanCode(v) { return String(v || "product").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18) || "product"; }
function uniqueCode(base, existing) {
  const b = `auto_${cleanCode(base)}`;
  let code = b, count = 2;
  while (existing.has(code)) { code = `${b}_${count}`.slice(0, 28); count += 1; }
  existing.add(code);
  return code;
}

export async function createAutopilotPack({ user, payload = {}, origin }) {
    const D = db();
    const niche = String(payload.niche || "all").trim().slice(0, 80) || "all";
    const allProducts =
      niche === "all"
        ? await D.Product.filter({ created_by_id: user.id }, "-created_at", 200)
        : await D.Product.filter({ created_by_id: user.id, category: niche }, "-created_at", 200);

    const requestedProductIds = Array.isArray(payload.product_ids) ? new Set(payload.product_ids.map(String)) : null;
    const topProducts = [...allProducts]
      .filter((product) => !requestedProductIds || requestedProductIds.has(String(product.id)))
      .sort((a, b) => (b.commission_rate || 0) - (a.commission_rate || 0))
      .slice(0, requestedProductIds ? requestedProductIds.size : 3);
    if (topProducts.length === 0) throw new Error("No products found for that niche");

    const existingLinks = await D.AffiliateLink.filter({ created_by_id: user.id }, "-created_at", 500);
    const existingCodes = new Set(existingLinks.map((l) => l.short_code).filter(Boolean));
    const trustedAppOrigin = origin;
    if (!trustedAppOrigin) throw new Error("Missing application origin");
    const regeneration = Math.max(0, Number(payload.regeneration) || 0);
    const archiveExisting = payload.archive_existing !== false;
    const weekStartsAt = new Date().toISOString();
    const linkByKey = {};

    for (const product of topProducts) {
      for (let variant = 1; variant <= 3; variant += 1) {
        const campaignId = regeneration > 0
          ? `autopilot:${product.id}:r${regeneration}:v${variant}`
          : `autopilot:${product.id}:v${variant}`;
        let link = existingLinks.find((l) => l.product_id === product.id && l.campaign_id === campaignId);
        if (!link) {
          const { url: destination, error: idError } = destinationForUser(user, product.url);
          if (idError) throw new Error(idError);
          link = await D.AffiliateLink.create({
            created_by_id: user.id,
            product_id: product.id,
            product_name: product.name,
            destination_url: destination,
            network: networkForDestination(destination, product.category),
            short_code: uniqueCode(`${product.name}_${variant}`, existingCodes),
            campaign_id: campaignId,
            clicks: 0, conversions: 0, earnings: 0,
          });
          existingLinks.push(link);
        }
        linkByKey[`${product.id}:${variant}`] = link;
      }

      if (archiveExisting) {
        const oldAutopilotPosts = await D.GeneratedPost.filter({ created_by_id: user.id, autopilot_enabled: true, product_id: product.id, niche });
        for (const oldPost of oldAutopilotPosts) {
          await D.GeneratedPost.update(oldPost.id, { status: "archived", autopilot_status: "paused" });
        }
      }
    }

    const productList = topProducts
      .map((product, index) => {
        const links = [1, 2, 3]
          // The /r/<code> short link, not the older
          // /functions/trackClick?code= form. These URLs go straight into the
          // ad copy, and the long form reads as an open redirect to social
          // platforms, which throttle it.
          .map((variant) => `Variant ${variant} link: ${trustedAppOrigin}/r/${encodeURIComponent(linkByKey[`${product.id}:${variant}`].short_code)}`)
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
          // `status` tracks whether a human actually published this;
          // `autopilot_status` tracks whether the rotation has it live. They
          // used to be conflated -- variant 1 was written straight to "posted"
          // although nothing had posted it -- which would tell the rotation a
          // never-published ad had failed and get its copy thrown away.
          status: "draft",
          clicks: 0,
          conversions: 0,
          ai_score: ad.ai_score || 8,
          ai_feedback: ad.ai_feedback || "Autopilot ad variation for testing.",
          trending_topics: product.category || niche,
          moderation_status: "passed",
          moderation_notes: JSON.stringify({ source: "createAutopilotPack", autopilot: true }),
          autopilot_enabled: true,
          // All three variants run side by side for the cycle, then each is
          // judged on its own interaction -- they are not staggered one per
          // day, so none of them starts out queued.
          autopilot_status: "running",
          niche,
          variant_number: variant,
          scheduled_day: variant,
          last_selected_at: weekStartsAt,
          cycle_starts_at: weekStartsAt,
          week_starts_at: weekStartsAt,
          regenerations: regeneration,
        };
      })
      .filter(Boolean)
      .slice(0, topProducts.length * 3);

    if (records.length === 0) throw new Error("No ads were generated. Please try again.");

    const created = await D.GeneratedPost.bulkCreate(records);
    return { success: true, products: topProducts, posts: created, message: `Built autopilot ads for ${topProducts.length} products.` };
}

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const result = await createAutopilotPack({
      user,
      payload: req.body || {},
      // Resolved to null when absent so the origin guard can fire --
      // `https://${undefined}` is the truthy string "https://undefined".
      origin: req.headers?.host ? `https://${req.headers.host}` : null,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("createAutopilotPack failed:", error);
    res.status(500).json({ error: error.message });
  }
}
