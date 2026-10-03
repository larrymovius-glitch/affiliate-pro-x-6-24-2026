import assert from "node:assert/strict";
import test from "node:test";
import { groupLinks, productNumberFor } from "../src/lib/linkGroups.js";

// URLs below are the real shapes stored in affiliate_links for this account.

test("eBay item number comes from /itm/<number>", () => {
  assert.equal(
    productNumberFor({ network: "ebay", destination_url: "https://www.ebay.com/itm/128014607393?_skw=x&campid=5339155721" }),
    "128014607393"
  );
});

test("Digistore24 product id comes from the promolink, else the ds_ short code", () => {
  assert.equal(
    productNumberFor({ network: "digistore24", destination_url: "https://www.digistore24.com/redir/419540/Here4_you//" }),
    "419540"
  );
  assert.equal(
    productNumberFor({ network: "digistore24", destination_url: "https://getnervovive24.com/text.php#aff=Here4_you", short_code: "ds_558763" }),
    "558763"
  );
});

test("a vendor-page link with no number anywhere gives null, not a guess", () => {
  assert.equal(
    productNumberFor({ network: "digistore24", destination_url: "https://getnervovive24.com/text.php#aff=Here4_you", short_code: "auto_nervovive_1_bottle_2" }),
    null
  );
});

test("ClickBank vendor nickname comes from the HopLink host", () => {
  assert.equal(productNumberFor({ network: "clickbank", destination_url: "https://apxalaska.fawea12.hop.clickbank.net" }), "fawea12");
  assert.equal(productNumberFor({ network: "clickbank", destination_url: "not a url" }), null);
});

test("copies of one product group under one row, per network, without being merged away", () => {
  const url = "https://www.digistore24.com/redir/419540/Here4_you//";
  const groups = groupLinks([
    { id: 1, network: "digistore24", product_name: "Glucotrust", destination_url: url, short_code: "ds_419540", clicks: 2 },
    { id: 2, network: "digistore24", product_name: "Glucotrust", destination_url: url, short_code: "auto_glucotrust", clicks: 1 },
    { id: 3, network: "ebay", product_name: "Watch", destination_url: "https://www.ebay.com/itm/188147615353", short_code: "x" },
  ]);
  assert.equal(groups.length, 2);
  const ds = groups.find((g) => g.networkId === "digistore24");
  assert.equal(ds.label, "Digistore24");
  assert.equal(ds.products.length, 1);
  assert.equal(ds.products[0].copies.length, 2);
  assert.equal(ds.products[0].clicks, 3);
  assert.equal(ds.products[0].productNumber, "419540");
});
