// Finding items that go with one product (a top, socks, shoes and jewellery
// for a pair of jeans): the owner's own products first, then eBay.
//
// The assistant decides what to search for -- that is a question of style it
// is good at. This file only does what must not be left to it: matching
// against the owner's catalogue, and reading listings from eBay itself, so a
// listing, its link and its picture are never invented.

const STOP = new Set(["a", "an", "and", "the", "for", "with", "of", "in", "to", "on", "or", "style", "mens", "men's", "womens", "women's", "size"]);

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * The owner's products that match a search, best first. A product matches
 * when at least half the search's words (and at least two, for searches of
 * two or more words) are in its name or description.
 *
 * @param {any[]} products
 * @param {string} query
 * @param {{ exclude?: string, limit?: number }} [opts]
 */
export function matchOwnProducts(products, query, { exclude, limit = 3 } = {}) {
  const want = [...new Set(words(query))];
  if (!want.length) return [];
  const need = want.length === 1 ? 1 : Math.max(2, Math.ceil(want.length / 2));
  return products
    .filter((p) => String(p.id) !== String(exclude ?? ""))
    .map((p) => {
      const have = new Set(words(`${p.name} ${p.description || ""}`));
      return { p, score: want.filter((w) => have.has(w)).length };
    })
    .filter((m) => m.score >= need)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => m.p);
}

/**
 * eBay's listing number from a Browse API item id ("v1|123456789012|0") or
 * a listing address (".../itm/123456789012"), so one listing isn't added
 * twice under two shapes of the same id.
 */
export function ebayListingNumber(idOrUrl) {
  const s = String(idOrUrl || "");
  return s.match(/^v1\|(\d+)\|/)?.[1] || s.match(/\/itm\/(?:[^/?#]+\/)?(\d{6,})/)?.[1] || (/^\d{6,}$/.test(s) ? s : null);
}
