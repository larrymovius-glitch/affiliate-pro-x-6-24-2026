// Facebook Page auto-posting: which product goes out next, what the post
// says, and the Graph API calls that publish it. Kept free of Supabase and
// fetch so tests can pin every refusal (policies rule 3).
//
// Three outcomes for every product, never two (policies rule 1):
//   - post it (with its picture only when the vendor allows that picture);
//   - skip it, because a rule says no;
//   - hold it for the owner, because nobody has checked the vendor's rules
//     yet, or the category is one where a wrong guess can cost the account.
// Held products are counted and shown on the Social page, never guessed at.

import { SUPPLEMENT_CLAIM } from "./adScripts.js";
import { FDA_DISCLAIMER, productFlags, vendorCreativeCheck } from "./platformRules.js";
import { shareUrlFor } from "./tracking.js";

export const GRAPH_VERSION = "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
// pages_manage_posts needs the other two alongside it to find the Page and
// read back what it published.
export const SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts";

export const DISCLOSURE = "#ad — I may earn a commission if you buy through my link.";
// The same product doesn't go out twice inside this window.
export const REPOST_AFTER_DAYS = 14;
const MAX_BODY_WORDS = 60;

const INCOME_CLAIM = /\$\s?\d|\bearn(s|ed|ing)?\b|\bincome\b|\bprofits?\b|\bmoney\b|\brich\b|\bguarantee\w*/i;
const LINKISH = /https?:\/\/|www\.|#\w/i;

/**
 * Whether a product may go out on the owner's Facebook Page unattended.
 *
 * @returns {{ status: "post", withImage: boolean } | { status: "skip" | "hold", reason: string }}
 */
export function facebookEligibility(product, link) {
  if (!product || product.is_active === false) return { status: "skip", reason: "Product is switched off." };
  if (!link || link.is_active === false || !link.short_code) return { status: "skip", reason: "No active tracked link." };

  const creative = vendorCreativeCheck(product);
  // Shopify's name can't appear in social posts without its written OK.
  if (!creative.ok && creative.escalate) return { status: "hold", reason: creative.reason };
  if (!product.creative_rule) {
    return { status: "hold", reason: "The vendor's rules haven't been checked yet, so it isn't known whether social posts are allowed." };
  }
  if (product.creative_rule === "unaltered") {
    return { status: "skip", reason: "The vendor allows only its own ads, posted exactly as supplied." };
  }

  const flags = productFlags(product);
  if (flags.weightLoss) {
    return { status: "hold", reason: "Weight-loss products are a category Facebook watches closely; post these yourself." };
  }
  if (flags.getRich) {
    return { status: "hold", reason: "Make-money offers are a category Facebook watches closely; post these yourself." };
  }

  return { status: "post", withImage: Boolean(creative.ok && product.image_url) };
}

/**
 * The next product to post for one owner, or null when nothing qualifies.
 *
 * @param {{ products: any[], links: any[], recentPosts: { product_id?: string, published_at?: string }[], now?: Date }} input
 */
export function pickNextPost({ products, links, recentPosts = [], now = new Date() }) {
  const cutoff = now.getTime() - REPOST_AFTER_DAYS * 86400000;
  const recentlyPosted = new Set(
    recentPosts
      .filter((p) => p.product_id && new Date(p.published_at || 0).getTime() >= cutoff)
      .map((p) => p.product_id)
  );
  const byId = new Map(products.map((p) => [p.id, p]));

  const held = [];
  const candidates = [];
  const seenProducts = new Set();
  for (const link of links) {
    const product = byId.get(link.product_id);
    if (!product || seenProducts.has(product.id)) continue;
    seenProducts.add(product.id);
    const verdict = facebookEligibility(product, link);
    if (verdict.status === "hold") held.push({ product: product.name, reason: verdict.reason });
    if (verdict.status !== "post" || recentlyPosted.has(product.id)) continue;
    candidates.push({ product, link, withImage: verdict.withImage });
  }

  // A picture stops the scroll; then what people already click.
  candidates.sort((a, b) => Number(b.withImage) - Number(a.withImage) || (b.link.clicks || 0) - (a.link.clicks || 0));
  return { next: candidates[0] || null, held };
}

/**
 * Why a written post body can't be used, or null when it can. The model is
 * told the rules; this is what enforces them.
 */
export function bodyProblem(body, product) {
  const text = String(body || "").trim();
  if (!text) return "empty";
  if (text.split(/\s+/).length > MAX_BODY_WORDS) return "too long";
  if (LINKISH.test(text)) return "has a link or hashtag";
  if (INCOME_CLAIM.test(text)) return "mentions money or a guarantee";
  if (productFlags(product).supplement && SUPPLEMENT_CLAIM.test(text)) return "makes a health or results claim";
  return null;
}

/** A body that says nothing a vendor or Facebook could object to. */
export function fallbackBody(product) {
  return `Here's something I came across: ${product.name}. If it sounds like something for you, take a look and decide for yourself.`;
}

/** The instruction given to the model for the post body. */
export function bodyPrompt(product) {
  const description = String(product.description || "").slice(0, 600);
  return [
    "Write the middle of a short Facebook Page post sharing an affiliate product. Write 1 or 2 sentences, under 45 words, in a friendly first-person voice.",
    "Say plainly what the product is and invite people to take a look and decide for themselves.",
    "Strict rules: no health, disease, weight, body or results claims; no income or money claims; no prices; no words like guaranteed, proven, miracle or secret; no links, no hashtags, no emojis.",
    "Return only the sentences, nothing else.",
    "",
    `Product: ${product.name}`,
    product.category ? `Category: ${product.category}` : "",
    description ? `Description: ${description}` : "",
  ].filter(Boolean).join("\n");
}

/** The full post: disclosure first, the tracked link on its own line, the FDA line for supplements. */
export function assemblePost({ product, link, body, origin }) {
  const url = shareUrlFor(link, origin);
  const parts = [DISCLOSURE, body.trim(), url];
  if (productFlags(product).supplement) parts.push(FDA_DISCLAIMER);
  return parts.join("\n\n");
}

/** Which Page to post to: one named for the app if there is one, else the first the person can post on. */
export function choosePage(pages = []) {
  const usable = pages.filter(
    (p) => p?.id && p?.access_token && (!Array.isArray(p.tasks) || p.tasks.includes("CREATE_CONTENT"))
  );
  return usable.find((p) => /\bapx\b|affiliate\s*pro/i.test(p.name || "")) || usable[0] || null;
}

/** The Graph API request that publishes the post. */
export function publishRequest({ pageId, pageToken, message, imageUrl }) {
  if (imageUrl) {
    return {
      url: `${GRAPH}/${encodeURIComponent(pageId)}/photos`,
      body: new URLSearchParams({ url: imageUrl, caption: message, access_token: pageToken }),
    };
  }
  return {
    url: `${GRAPH}/${encodeURIComponent(pageId)}/feed`,
    body: new URLSearchParams({ message, access_token: pageToken }),
  };
}

/** True when Facebook says the stored token no longer works and only reconnecting will fix it. */
export function needsReconnect(error) {
  return Number(error?.code) === 190 || Number(error?.error_subcode) === 460 || Number(error?.error_subcode) === 463;
}
