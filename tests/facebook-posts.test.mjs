import assert from "node:assert/strict";
import test from "node:test";
import {
  assemblePost,
  bodyProblem,
  choosePage,
  DISCLOSURE,
  facebookEligibility,
  fallbackBody,
  needsReconnect,
  pickNextPost,
  publishRequest,
} from "../api/_lib/facebookPosts.js";
import { FDA_DISCLAIMER } from "../api/_lib/platformRules.js";

// Facebook auto-posting runs unattended, so every refusal is pinned here.
// Product names are the owner's real ones as of 2026-10-15.

const product = (over = {}) => ({
  id: "p1",
  name: "Advanced Amino Formula",
  url: "https://www.advancedbionutritionals.com/aminos",
  creative_rule: "own_or_official",
  image_source: "own",
  image_url: "https://apx.amhere4utoday.com/product-images/advanced-amino-formula.jpg",
  is_active: true,
  ...over,
});
const link = (over = {}) => ({ id: "l1", product_id: "p1", short_code: "easy_advanced_amino_for", destination_url: "https://www.advancedbionutritionals.com/x", clicks: 60, is_active: true, ...over });

test("a checked product with an allowed picture posts with it", () => {
  assert.deepEqual(facebookEligibility(product(), link()), { status: "post", withImage: true });
});

test("a picture from the sales page is left off, but the post still goes", () => {
  assert.deepEqual(facebookEligibility(product({ image_source: "sales_page" }), link()), { status: "post", withImage: false });
});

test("unchecked vendor rules are held for the owner, not guessed", () => {
  assert.equal(facebookEligibility(product({ creative_rule: null }), link()).status, "hold");
});

test("vendors that allow only their own unedited ads are skipped", () => {
  assert.equal(facebookEligibility(product({ creative_rule: "unaltered" }), link()).status, "skip");
});

test("Shopify without written permission is held", () => {
  assert.equal(facebookEligibility(product({ url: "https://www.shopify.com/free-trial" }), link()).status, "hold");
});

for (const name of ["Java Burn", "Sumatra Slim Belly Tonic", "AI Wealth Profit $67 V1", "Perpetual Income 365"]) {
  test(`${name} is held: weight-loss and make-money offers go out by hand`, () => {
    assert.equal(facebookEligibility(product({ name }), link()).status, "hold");
  });
}

test("inactive products and links never post", () => {
  assert.equal(facebookEligibility(product({ is_active: false }), link()).status, "skip");
  assert.equal(facebookEligibility(product(), link({ is_active: false })).status, "skip");
});

test("picks a pictured product first, then the most clicked, and skips recent ones", () => {
  const now = new Date("2026-10-16T14:00:00Z");
  const products = [
    product({ id: "a", name: "ProDentim", image_source: "sales_page" }),
    product({ id: "b", name: "Advanced Amino Formula" }),
    product({ id: "c", name: "Advanced Memory Formula" }),
  ];
  const links = [
    link({ id: "la", product_id: "a", clicks: 500 }),
    link({ id: "lb", product_id: "b", clicks: 60 }),
    link({ id: "lc", product_id: "c", clicks: 5 }),
  ];
  assert.equal(pickNextPost({ products, links, now }).next.product.id, "b");

  const recentPosts = [{ product_id: "b", published_at: "2026-10-10T14:00:00Z" }];
  assert.equal(pickNextPost({ products, links, recentPosts, now }).next.product.id, "c");

  const old = [{ product_id: "b", published_at: "2026-09-01T14:00:00Z" }];
  assert.equal(pickNextPost({ products, links, recentPosts: old, now }).next.product.id, "b");
});

test("reports held products and returns nothing when none qualify", () => {
  const { next, held } = pickNextPost({ products: [product({ creative_rule: null })], links: [link()] });
  assert.equal(next, null);
  assert.equal(held.length, 1);
});

test("model text with claims, money, links or hashtags is refused", () => {
  const p = product();
  assert.equal(bodyProblem("This amino formula may help you burn fat fast.", p), "makes a health or results claim");
  assert.equal(bodyProblem("Guaranteed to work for everyone.", p), "mentions money or a guarantee");
  assert.equal(bodyProblem("Take a look at www.example.com", p), "has a link or hashtag");
  assert.equal(bodyProblem("Worth a look #health", p), "has a link or hashtag");
  assert.equal(bodyProblem("", p), "empty");
  assert.equal(bodyProblem("I came across Advanced Amino Formula, an amino acid supplement. Take a look and decide for yourself.", p), null);
});

test("the fallback text passes its own checks", () => {
  for (const name of ["Advanced Amino Formula", "Water Freedom System", "No Grid Survival Projects"]) {
    assert.equal(bodyProblem(fallbackBody({ name }), { name }), null);
  }
});

test("posts open with the disclosure, carry the tracked link, and add the FDA line for supplements", () => {
  const msg = assemblePost({ product: product(), link: link(), body: "Worth a look.", origin: "https://apx.amhere4utoday.com" });
  assert.ok(msg.startsWith(DISCLOSURE));
  assert.ok(msg.includes("https://apx.amhere4utoday.com/r/easy_advanced_amino_for"));
  assert.ok(msg.endsWith(FDA_DISCLAIMER));

  const plain = assemblePost({ product: product({ name: "Water Freedom System" }), link: link(), body: "Worth a look.", origin: "https://apx.amhere4utoday.com" });
  assert.ok(!plain.includes(FDA_DISCLAIMER));
});

test("prefers the APX Page, and never one the person can't post on", () => {
  const pages = [
    { id: "1", name: "Larry's Garage", access_token: "t1", tasks: ["CREATE_CONTENT"] },
    { id: "2", name: "APX Affiliate Pro X", access_token: "t2", tasks: ["CREATE_CONTENT"] },
  ];
  assert.equal(choosePage(pages).id, "2");
  assert.equal(choosePage([{ id: "3", name: "APX", access_token: "t", tasks: ["ANALYZE"] }]), null);
  assert.equal(choosePage([]), null);
});

test("a photo post when there's a picture, a text post otherwise", () => {
  assert.match(publishRequest({ pageId: "9", pageToken: "t", message: "m", imageUrl: "https://x/y.jpg" }).url, /\/9\/photos$/);
  assert.match(publishRequest({ pageId: "9", pageToken: "t", message: "m" }).url, /\/9\/feed$/);
});

test("an expired or revoked token asks for a reconnect", () => {
  assert.equal(needsReconnect({ code: 190 }), true);
  assert.equal(needsReconnect({ code: 100 }), false);
});

test("reads the ticked Page ids from Login for Business's granted scopes", async () => {
  const { pageIdsFromGranularScopes } = await import("../api/_lib/facebookPosts.js");
  const debug = { data: { granular_scopes: [
    { scope: "pages_manage_posts", target_ids: ["111"] },
    { scope: "pages_show_list", target_ids: ["111", "222"] },
    { scope: "public_profile" },
  ] } };
  assert.deepEqual(pageIdsFromGranularScopes(debug), ["111", "222"]);
  assert.deepEqual(pageIdsFromGranularScopes({}), []);
});
