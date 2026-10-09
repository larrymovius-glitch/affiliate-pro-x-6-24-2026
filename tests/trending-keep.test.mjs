import assert from "node:assert/strict";
import test from "node:test";
import { trendingKeepCheck, trendingKeepReason } from "../api/_lib/trendingKeep.js";

const link = { id: "L1", destination_url: "https://apxalaska.audifort.hop.clickbank.net", earnings: 0 };
const bare = { link, product: { id: "P1" }, otherLinks: 0, posts: 0 };

test("an untouched trending product may be replaced", () => {
  assert.equal(trendingKeepReason(bare), null);
});

test("every kind of owner work keeps the product", () => {
  assert.ok(trendingKeepReason({ ...bare, link: { ...link, earnings: 4.5 } }));
  assert.ok(trendingKeepReason({ ...bare, link: { ...link, bio_featured_at: "2026-10-01" } }));
  assert.ok(trendingKeepReason({ ...bare, product: { id: "P1", creative_rule: "official_only" } }));
  assert.ok(trendingKeepReason({ ...bare, product: { id: "P1", image_source: "official" } }));
  assert.ok(trendingKeepReason({ ...bare, product: { id: "P1", image_source: "own" } }));
  // The picture finder saves a sales-page picture on its own; that alone is
  // not the owner's work.
  assert.equal(trendingKeepReason({ ...bare, product: { id: "P1", image_source: "sales_page" } }), null);
  assert.ok(trendingKeepReason({ ...bare, otherLinks: 1 }));
  assert.ok(trendingKeepReason({ ...bare, posts: 1 }));
});

// A fake db() holding the Audifort state from the night it was deleted.
function fakeDb({ product, links, posts }) {
  return {
    Product: { filter: async () => (product ? [product] : []) },
    AffiliateLink: { filter: async () => links },
    GeneratedPost: { filter: async () => posts },
  };
}

test("Audifort, as it was on 2026-10-07, would now be kept", async () => {
  const D = fakeDb({
    product: { id: "P1", category: "clickbank_trending", creative_rule: "official_only", image_source: "official" },
    links: [link, { id: "L2" }, { id: "L3" }, { id: "L4" }],
    posts: [{ status: "draft" }, { status: "draft" }, { status: "draft" }],
  });
  const { reason } = await trendingKeepCheck(D, link, ["clickbank_trending"]);
  assert.ok(reason);
});

test("the trending link itself and archived posts don't count as owner work", async () => {
  const D = fakeDb({ product: { id: "P1" }, links: [link], posts: [{ status: "archived" }] });
  const { reason, products } = await trendingKeepCheck(D, link, ["clickbank_trending"]);
  assert.equal(reason, null);
  assert.equal(products.length, 1);
});
