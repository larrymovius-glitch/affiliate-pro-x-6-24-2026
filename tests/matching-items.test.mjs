import assert from "node:assert/strict";
import test from "node:test";
import { ebayListingNumber, matchOwnProducts } from "../api/_lib/matchingItems.js";
import { executeTool } from "../api/_lib/assistantTools.js";
import { isPoorCondition } from "../api/_lib/ebay.js";

// Items that go with a product: the owner's own products first, then eBay.
// The assistant picks the searches; the listings, links and pictures come
// only from eBay itself, and nothing is added until the owner chooses it.

const JEANS = { id: "p1", created_by_id: "me", name: "Levi's 501 Vintage Style Jeans Blue", url: "https://www.ebay.com/itm/111111111", category: "ebay_match" };
const TEE = { id: "p2", created_by_id: "me", name: "Vintage White Crew Neck Tee", url: "https://www.ebay.com/itm/222222222", category: "ebay_match" };
const PILLS = { id: "p3", created_by_id: "me", name: "Glucotrust", url: "https://vendor.test/" };

test("own products match on most of the search's words, never the product itself", () => {
  const mine = [JEANS, TEE, PILLS];
  assert.deepEqual(matchOwnProducts(mine, "vintage white tee women").map((p) => p.id), ["p2"]);
  assert.deepEqual(matchOwnProducts(mine, "vintage jeans", { exclude: "p1" }), []);
  assert.deepEqual(matchOwnProducts(mine, "silver hoop earrings"), []);
});

test("an eBay listing number reads the same from an item id or a listing address", () => {
  assert.equal(ebayListingNumber("v1|123456789012|0"), "123456789012");
  assert.equal(ebayListingNumber("https://www.ebay.com/itm/Some-Title/123456789012?campid=5"), "123456789012");
  assert.equal(ebayListingNumber("https://vendor.test/"), null);
});

function fakeDb(products) {
  const created = { Product: [], AffiliateLink: [] };
  return {
    created,
    Product: {
      filter: async (f) => products.filter((p) => Object.entries(f).every(([k, v]) => p[k] === v)),
      create: async (row) => { const p = { id: `new${created.Product.length + 1}`, ...row }; created.Product.push(p); return p; },
    },
    AffiliateLink: {
      filter: async () => created.AffiliateLink,
      create: async (row) => { created.AffiliateLink.push(row); return row; },
    },
  };
}

const LISTING = {
  itemId: "v1|333333333|0",
  title: "Silver Hoop Earrings",
  image: { imageUrl: "https://i.ebayimg.com/images/g/abc/s-l225.jpg" },
  price: { value: "12.00", currency: "USD" },
  condition: "New",
  itemWebUrl: "https://www.ebay.com/itm/333333333",
  itemAffiliateWebUrl: "https://www.ebay.com/itm/333333333?campid=CAMP",
};

function fakeEbay({ configured = true, items = { "v1|333333333|0": LISTING }, found = [LISTING] } = {}) {
  const searches = [];
  return {
    searches,
    lib: {
      ebayConfigured: () => configured,
      isPoorCondition,
      getEbayAppToken: async () => "tok",
      searchEbayItems: async (_t, _c, q, opts) => { searches.push({ q, ...opts }); return found; },
      getEbayItem: async (_t, _c, id) => items[id] || null,
      affiliateUrlFor: (i) => i.itemAffiliateWebUrl,
      listingFacts: (i) => `Condition: ${i.condition}`,
      itemSummary: (i) => ({ item_id: i.itemId, title: i.title, image_url: i.image.imageUrl, price: `$${i.price.value}`, condition: i.condition }),
    },
  };
}

const user = { id: "me", affiliate_network_ids: { ebay: "CAMP" } };

test("find_matching_items returns the owner's matches and buy-it-now eBay listings, and saves nothing", async () => {
  const D = fakeDb([JEANS, TEE, PILLS]);
  const e = fakeEbay();
  const out = await executeTool(
    "find_matching_items",
    { product_id: "p1", searches: [{ item_type: "top", query: "vintage white tee" }, { item_type: "jewellery", query: "silver hoop earrings" }] },
    { user, D, ebay: e.lib }
  );
  assert.equal(out.goes_with.name, JEANS.name);
  assert.deepEqual(out.results[0].already_yours.map((p) => p.id), ["p2"]);
  assert.equal(out.results[1].ebay[0].item_id, "v1|333333333|0");
  assert.ok(e.searches.every((s) => s.buyNowOnly === true));
  assert.equal(D.created.Product.length, 0);
});

test("without eBay set up, it still checks the owner's own products and says why", async () => {
  const out = await executeTool(
    "find_matching_items",
    { product_id: "p1", searches: [{ item_type: "top", query: "vintage white tee" }] },
    { user, D: fakeDb([JEANS, TEE]), ebay: fakeEbay({ configured: false }).lib }
  );
  assert.deepEqual(out.results[0].already_yours.map((p) => p.id), ["p2"]);
  assert.deepEqual(out.results[0].ebay, []);
  assert.match(out.ebay_note, /isn't set up/);
});

test("add_ebay_items re-reads each listing from eBay and adds it with a tracked link", async () => {
  const D = fakeDb([JEANS]);
  const out = await executeTool("add_ebay_items", { item_ids: ["v1|333333333|0", "v1|999999999|0"], goes_with_product_id: "p1" }, { user, D, ebay: fakeEbay().lib, origin: "https://app.test" });
  assert.equal(out.added.length, 1);
  assert.match(out.skipped[0].reason, /sold or ended/);
  const p = D.created.Product[0];
  assert.equal(p.url, LISTING.itemAffiliateWebUrl);
  assert.equal(p.network, "ebay");
  assert.match(p.description, /Goes with: Levi's 501/);
  assert.equal(D.created.AffiliateLink[0].destination_url, LISTING.itemAffiliateWebUrl);
  assert.match(out.added[0].share_url, /^https:\/\/app\.test\/r\//);
});

test("add_ebay_items won't add a listing twice, or anything without the owner's campaign id", async () => {
  const D = fakeDb([JEANS, { ...TEE, id: "p9", url: "https://www.ebay.com/itm/333333333?campid=CAMP" }]);
  const dup = await executeTool("add_ebay_items", { item_ids: ["v1|333333333|0"] }, { user, D, ebay: fakeEbay().lib });
  assert.equal(dup.added.length, 0);
  assert.match(dup.skipped[0].reason, /Already/);

  const none = await executeTool("add_ebay_items", { item_ids: ["v1|333333333|0"] }, { user: { id: "me" }, D: fakeDb([]), ebay: fakeEbay().lib });
  assert.equal(none.needs_owner, true);
});

test("worn (Fair) and for-parts listings are left out of results and never added", async () => {
  const fair = { ...LISTING, itemId: "v1|444444444|0", title: "Mickey Tee", condition: "Pre-owned - Fair", conditionId: "3010" };
  const parts = { ...LISTING, itemId: "v1|555555555|0", title: "Watch", condition: "For parts or not working" };
  const e = fakeEbay({ found: [fair, parts, LISTING], items: { "v1|444444444|0": fair } });
  const out = await executeTool("find_matching_items", { product_id: "p1", searches: [{ item_type: "top", query: "vintage tee" }] }, { user, D: fakeDb([JEANS]), ebay: e.lib });
  assert.deepEqual(out.results[0].ebay.map((i) => i.item_id), ["v1|333333333|0"]);

  const D = fakeDb([JEANS]);
  const add = await executeTool("add_ebay_items", { item_ids: ["v1|444444444|0"] }, { user, D, ebay: e.lib });
  assert.equal(add.added.length, 0);
  assert.match(add.skipped[0].reason, /Fair/);
  assert.equal(isPoorCondition({ condition: "Pre-owned - Good" }), false);
});
