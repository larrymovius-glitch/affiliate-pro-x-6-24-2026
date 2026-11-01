import test from "node:test";
import assert from "node:assert/strict";
import {
  CLICKBANK_AFFILIATE_ID,
  DIGISTORE_AFFILIATE_ID,
  NEED_CLICKBANK_ID,
  applyClickBankAffiliateId,
  destinationForUser,
  ownClickBankId,
  ownDigistoreId,
} from "../api/_lib/affiliates.js";
import { STARTER_PRODUCTS, starterHopLink, starterShortCode } from "../src/lib/starterProducts.js";

const HOP = "https://someone.vendor.hop.clickbank.net";
const ENCRYPTED = "https://2932f2ztddoo-91gljhlinczeq.hop.clickbank.net";

test("a member's own ID never falls back to the house account", () => {
  assert.equal(ownClickBankId({}), null);
  assert.equal(ownClickBankId(null), null);
  assert.equal(ownClickBankId({ clickbank_nickname: "  " }), null);
  assert.equal(ownClickBankId({ clickbank_nickname: "mine" }), "mine");
  assert.equal(ownDigistoreId({ affiliate_network_ids: {} }), null);
  assert.equal(ownDigistoreId({ affiliate_network_ids: { digistore24: "Mine" } }), "Mine");
});

test("a ClickBank link is refused until the member saves their own nickname", () => {
  const refused = destinationForUser({ id: "new" }, HOP);
  assert.equal(refused.url, null);
  assert.equal(refused.error, NEED_CLICKBANK_ID);
});

test("a saved nickname replaces whoever's ID was in the product link", () => {
  const { url, error } = destinationForUser({ clickbank_nickname: "mine" }, HOP);
  assert.equal(error, null);
  assert.match(url, /^https:\/\/mine\.vendor\.hop\.clickbank\.net/);
});

test("an encrypted hoplink is never rewritten", () => {
  assert.equal(applyClickBankAffiliateId(ENCRYPTED, "mine"), ENCRYPTED);
  assert.equal(applyClickBankAffiliateId(ENCRYPTED, CLICKBANK_AFFILIATE_ID), ENCRYPTED);
});

test("a member's encrypted link is used as given, with or without a saved nickname", () => {
  assert.deepEqual(destinationForUser({ clickbank_nickname: "mine" }, ENCRYPTED), { url: ENCRYPTED, error: null });
  assert.deepEqual(destinationForUser({}, ENCRYPTED), { url: ENCRYPTED, error: null });
});

test("links outside ClickBank need no nickname and pass through untouched", () => {
  assert.deepEqual(destinationForUser({}, "https://example.com/x"), { url: "https://example.com/x", error: null });
});

test("starter links use the member's nickname, never a house ID", () => {
  for (const { vendor } of STARTER_PRODUCTS) {
    const url = starterHopLink("mine", vendor);
    assert.equal(url, `https://mine.${vendor}.hop.clickbank.net`);
    assert.ok(!url.includes(CLICKBANK_AFFILIATE_ID) && !url.includes(DIGISTORE_AFFILIATE_ID));
  }
});

test("starter short codes don't collide", () => {
  assert.equal(starterShortCode("enrev"), "cb_enrev");
  assert.equal(starterShortCode("enrev", [{ short_code: "cb_enrev" }]), "cb_enrev_2");
});
