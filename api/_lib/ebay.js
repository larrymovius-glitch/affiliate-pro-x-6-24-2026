// eBay Browse API, shared by the nightly trending sync and Maya's
// find_matching_items / add_ebay_items tools.

import { largestEbayImage } from "./images.js";

const EBAY_API_BASE = "https://api.ebay.com";

export function ebayConfigured() {
  return !!(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID);
}

// App-level OAuth (client_credentials) -- separate from a user's own eBay
// login. This is all the Browse API needs; it doesn't require anyone to
// "connect an eBay account".
export async function getEbayAppToken({ fetch = globalThis.fetch } = {}) {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) throw new Error("eBay is not configured (missing EBAY_APP_ID or EBAY_CERT_ID)");

  const res = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || "Failed to authenticate with eBay");
  return data.access_token;
}

// Passing the campaign id via X-EBAY-C-ENDUSERCTX makes eBay return
// itemAffiliateWebUrl pre-tracked; campid is appended manually as a fallback
// for the rare item that doesn't carry that field.
function headers(token, campaignId) {
  return {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    ...(campaignId ? { "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${campaignId}` } : {}),
  };
}

/**
 * Up to `limit` live listings for a search, best match first. `buyNowOnly`
 * leaves out auctions, which end within days -- too soon for a product that
 * is meant to stay on the share page.
 */
export async function searchEbayItems(token, campaignId, query, { limit = 3, buyNowOnly = false, fetch = globalThis.fetch } = {}) {
  const filter = buyNowOnly ? `&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}` : "";
  const url = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}${filter}`;
  const res = await fetch(url, { headers: headers(token, campaignId) });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
}

/** One listing by eBay's item id, or null when it's gone or not found. */
export async function getEbayItem(token, campaignId, itemId, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(`${EBAY_API_BASE}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, { headers: headers(token, campaignId) });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// What a buyer actually decides on, in the listing's own words: condition,
// where it ships from, whether shipping is free. Recorded on the product so
// the ad script can say them -- and, just as much, so it cannot say them when
// eBay hasn't. "New in sealed box, ships free from the US" is a great line in
// an ad and a serious problem when it isn't true of the listing.
//
// Deliberately no price: a video outlives the price it quotes.
export function listingFacts(item) {
  const facts = [];
  if (item?.condition) facts.push(`Condition: ${item.condition}`);
  const country = item?.itemLocation?.country;
  if (country) facts.push(`Ships from: ${country}`);
  const shipping = (item?.shippingOptions || [])[0];
  if (shipping?.shippingCostType === "FIXED" && Number(shipping?.shippingCost?.value) === 0) {
    facts.push("Shipping: free");
  }
  if (item?.seller?.feedbackPercentage) facts.push(`Seller feedback: ${item.seller.feedbackPercentage}%`);
  return facts.join(". ");
}

export function affiliateUrlFor(item, campaignId) {
  if (item?.itemAffiliateWebUrl) return item.itemAffiliateWebUrl;
  if (!item?.itemWebUrl) return null;
  const sep = item.itemWebUrl.includes("?") ? "&" : "?";
  return `${item.itemWebUrl}${sep}campid=${encodeURIComponent(campaignId)}`;
}

/** A listing trimmed to what the owner needs to choose it. */
export function itemSummary(item) {
  const price = item?.price?.value ? `${item.price.currency === "USD" ? "$" : `${item.price.currency || ""} `}${item.price.value}` : null;
  return {
    item_id: item.itemId,
    title: item.title,
    image_url: largestEbayImage(item.image?.imageUrl || ""),
    ...(price ? { price } : {}),
    ...(item.condition ? { condition: item.condition } : {}),
    view_url: item.itemWebUrl || null,
  };
}
