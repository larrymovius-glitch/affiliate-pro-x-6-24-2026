import assert from "node:assert/strict";
import test from "node:test";
import { isShopifyUrl, mustShareAsGiven, shareUrlFor } from "../api/_lib/tracking.js";
import { vendorCreativeCheck } from "../api/_lib/platformRules.js";
import { renderBioPage } from "../api/_lib/bio.js";

// Shopify's affiliate terms (Impact): links may not be modified or masked
// (Part B §4.2, §7.1.7), and its name may not appear in ads or social media
// without its written permission first (Part A §6.3.1).

const SHOPIFY = "https://shopify.pxf.io/abc123";

test("Shopify links are recognised, and nobody else's", () => {
  assert.equal(isShopifyUrl(SHOPIFY), true);
  assert.equal(isShopifyUrl("https://www.shopify.com/free-trial"), true);
  assert.equal(isShopifyUrl("https://goto.samsclub.com/k42qad"), false);
  assert.equal(isShopifyUrl("https://notshopify.com/"), false);
});

test("a Shopify link is shared exactly as Impact gave it, never as the app's /r/ short link", () => {
  assert.equal(mustShareAsGiven(SHOPIFY), true);
  assert.equal(shareUrlFor({ short_code: "ABC", destination_url: SHOPIFY }, "https://app.test"), SHOPIFY);
  assert.equal(shareUrlFor({ short_code: "ABC", destination_url: "https://goto.samsclub.com/k42qad" }, "https://app.test"), "https://app.test/r/ABC");
});

test("the share page's Shopify button is Shopify's own link", () => {
  const html = renderBioPage({ handle: "me", links: [{ short_code: "ABC", direct_url: SHOPIFY, product_name: "Shopify" }, { short_code: "XYZ", product_name: "Sams" }] });
  assert.match(html, /href="https:\/\/shopify\.pxf\.io\/abc123"/);
  assert.match(html, /href="\/r\/XYZ"/);
  assert.doesNotMatch(html, /href="\/r\/ABC"/);
});

test("no Shopify ad until the owner records Shopify's written permission", () => {
  const product = { name: "Shopify", url: SHOPIFY, creative_rule: "any", image_source: "own" };
  const blocked = vendorCreativeCheck(product);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.escalate, true, "it goes back to the owner, not a flat no");
  assert.equal(vendorCreativeCheck({ ...product, brand_ad_permission: "email from Shopify affiliate team, Oct 12 2026" }).ok, true);
});
