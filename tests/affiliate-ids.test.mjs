import assert from "node:assert/strict";
import test from "node:test";
import {
  getClickBankAffiliateId,
  getDigistoreAffiliateId,
  digistorePromoLink,
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
