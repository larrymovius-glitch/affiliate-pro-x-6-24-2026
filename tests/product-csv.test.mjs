import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, productsFromCsv, productsToCsv } from "../src/lib/productCsv.js";

const ebay = {
  name: '(12) Card Graded Football, Baseball, Soccer Lot PSA 9 & 10 *READ* 12" case',
  url: "https://www.ebay.com/itm/1?campid=5339155721&customid=",
  category: "ebay_trending",
  commission_rate: 0,
  network: "ebay",
  description: "Condition: Used.\nShips from: US — free",
  image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg",
  creative_rule: "own_or_official",
  is_active: true,
  created_at: "2026-10-06T12:00:00Z",
};

test("an export imports back with commas, quotes, line breaks and details intact", () => {
  const [p] = productsFromCsv(productsToCsv([ebay]));
  assert.equal(p.name, ebay.name);
  assert.equal(p.url, ebay.url);
  assert.equal(p.description, ebay.description);
  assert.equal(p.image_url, ebay.image_url);
  assert.equal(p.network, "ebay");
  assert.equal(p.creative_rule, "own_or_official");
  assert.equal(p.commission_rate, 0);
});

test("the header row is not imported as a product", () => {
  const products = productsFromCsv(productsToCsv([ebay, { ...ebay, name: "Second", url: "https://x.com" }]));
  assert.deepEqual(products.map((p) => p.name), [ebay.name, "Second"]);
});

test("a headerless paste is read as name, url, category, commission_rate", () => {
  const [p] = productsFromCsv('"Thing, deluxe","https://a.com","Tech",10');
  assert.equal(p.name, "Thing, deluxe");
  assert.equal(p.category, "Tech");
  assert.equal(p.commission_rate, 10);
});

test("a title Excel would run as a formula is defused on export and restored on import", () => {
  const csv = productsToCsv([{ ...ebay, name: "=HYPERLINK(1)" }]);
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.equal(productsFromCsv(csv)[0].name, "=HYPERLINK(1)");
});

test("values the database would reject are dropped, not stored", () => {
  const csv = 'name,url,network,creative_rule,image_source\n"A","https://a.com","myspace","whatever","official"';
  const [p] = productsFromCsv(csv);
  assert.equal(p.network, undefined);
  assert.equal(p.creative_rule, undefined);
  // An image source without an image says nothing.
  assert.equal(p.image_source, undefined);
});

test("the export starts with a BOM and the parser ignores it", () => {
  const csv = productsToCsv([ebay]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(parseCsv(csv)[0][0], "name");
});
