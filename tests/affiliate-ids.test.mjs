import assert from "node:assert/strict";
import test from "node:test";
import {
  getClickBankAffiliateId,
  getDigistoreAffiliateId,
  digistorePromoLink,
  applyClickBankAffiliateId,
  CLICKBANK_AFFILIATE_ID,
  DIGISTORE_AFFILIATE_ID,
} from "../api/_lib/affiliates.js";

test("getClickBankAffiliateId falls back to the house account with no nickname saved", () => {
  assert.equal(getClickBankAffiliateId({}), CLICKBANK_AFFILIATE_ID);
  assert.equal(getClickBankAffiliateId(null), CLICKBANK_AFFILIATE_ID);
  assert.equal(getClickBankAffiliateId({ clickbank_nickname: "  " }), CLICKBANK_AFFILIATE_ID);
});

test("getClickBankAffiliateId uses the user's own nickname when set", () => {
  assert.equal(getClickBankAffiliateId({ clickbank_nickname: "mynick" }), "mynick");
});

test("getDigistoreAffiliateId falls back to the house account with nothing saved on /networks", () => {
  assert.equal(getDigistoreAffiliateId({}), DIGISTORE_AFFILIATE_ID);
  assert.equal(getDigistoreAffiliateId(null), DIGISTORE_AFFILIATE_ID);
  assert.equal(getDigistoreAffiliateId({ affiliate_network_ids: {} }), DIGISTORE_AFFILIATE_ID);
});

test("getDigistoreAffiliateId uses the user's own saved id -- the /networks save actually does something now", () => {
  assert.equal(getDigistoreAffiliateId({ affiliate_network_ids: { digistore24: "mydsid" } }), "mydsid");
});

test("digistorePromoLink defaults to the house account, but takes a per-user override", () => {
  assert.equal(digistorePromoLink("12345"), `https://www.digistore24.com/redir/12345/${DIGISTORE_AFFILIATE_ID}/`);
  assert.equal(
    digistorePromoLink("12345", getDigistoreAffiliateId({ affiliate_network_ids: { digistore24: "mydsid" } })),
    "https://www.digistore24.com/redir/12345/mydsid/"
  );
});

// --- Encrypted hoplinks must survive the rewrite ------------------------------
// Regression: overwriting label 0 turned a real encrypted hoplink into
// `apxalaska.hop.clickbank.net` -- vendor gone, link pointing at no product.
// Four links in production were destroyed this way before it was caught, each
// worth $0 no matter how well it was promoted.

test("leaves an encrypted hoplink untouched instead of destroying the vendor", () => {
  const encrypted = "https://2932f2ztddoo-91gljhlinczeq.hop.clickbank.net/";
  assert.equal(applyClickBankAffiliateId(encrypted, "apxalaska"), encrypted);

  // The exact shape that broke, from the products table.
  const audifort = "https://02ed9wwle8lev-2zw6ld1nyu1j.hop.clickbank.net";
  assert.equal(applyClickBankAffiliateId(audifort, "someone_else"), audifort);
});

test("still rewrites the classic affiliate.vendor hoplink, which is editable", () => {
  assert.equal(
    applyClickBankAffiliateId("https://oldaff.vendorname.hop.clickbank.net/", "apxalaska"),
    "https://apxalaska.vendorname.hop.clickbank.net/"
  );
});

test("still rewrites the query-parameter hoplink shape", () => {
  assert.equal(
    applyClickBankAffiliateId("https://hop.clickbank.net/?vendor=acme", "apxalaska"),
    "https://hop.clickbank.net/?vendor=acme&affiliate=apxalaska"
  );
});

test("never rewrites a look-alike domain into a ClickBank link", () => {
  // endsWith(".hop.clickbank.net") is the guard; make sure a neighbouring
  // domain is not caught by it.
  const notClickBank = "https://evilhop.clickbank.net.attacker.test/x";
  assert.equal(applyClickBankAffiliateId(notClickBank, "apxalaska"), notClickBank);
});
