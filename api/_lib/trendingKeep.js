// The nightly trending syncs replace products that dropped off the trending
// list. A product the owner has put work into is not theirs to replace: on
// 2026-10-07 the refresh deleted Audifort -- official picture, the vendor's
// image rule, three of the owner's own links and three drafted posts -- because
// Audifort stopped trending and had not earned yet.

/**
 * Why a trending link and its product must survive the refresh, or null if
 * they may go.
 *
 * @param {object} facts
 * @param {any} facts.link the trending AffiliateLink
 * @param {any} [facts.product] its Product, if it still exists
 * @param {number} facts.otherLinks the owner's other links to the product
 * @param {number} facts.posts posts made for the product, archived ones excluded
 * @returns {string | null}
 */
export function trendingKeepReason({ link, product, otherLinks, posts }) {
  if ((Number(link?.earnings) || 0) > 0) return "has earnings";
  // On the share page means an ad may point at it: a TikTok ad lives for
  // weeks, and "link in bio" must still lead somewhere tomorrow.
  if (link?.bio_featured_at) return "on the share page";
  if (product?.creative_rule) return "vendor rules checked";
  // Official or the owner's own. A sales-page picture is what the automatic
  // picture finder saves for every product, so it says nothing about the
  // owner's work -- counting it would keep every trending product forever.
  if (["official", "own"].includes(product?.image_source)) return "picture confirmed";
  if (otherLinks > 0) return "has the owner's own links";
  if (posts > 0) return "has posts";
  return null;
}

/**
 * Gathers the facts trendingKeepReason needs for one trending link.
 *
 * @param {any} D the db() proxy
 * @param {any} link
 * @param {string[]} categories the product categories this sync owns
 * @returns {Promise<{ reason: string | null, products: any[] }>} products are
 *   the sync's own products at that link, for deletion when reason is null
 */
export async function trendingKeepCheck(D, link, categories) {
  const products = await D.Product.filter({ url: link.destination_url, category: { $in: categories } });
  const product = products[0];
  if (!product) return { reason: trendingKeepReason({ link, otherLinks: 0, posts: 0 }), products };

  const links = await D.AffiliateLink.filter({ product_id: product.id });
  const posts = await D.GeneratedPost.filter({ product_id: product.id });
  const reason = trendingKeepReason({
    link,
    product,
    otherLinks: links.filter((l) => l.id !== link.id).length,
    posts: posts.filter((p) => p.status !== "archived").length,
  });
  return { reason, products };
}
