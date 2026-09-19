import assert from "node:assert/strict";
import test from "node:test";
import { isDigistoreProductId, parseDigistoreInput } from "../api/_lib/affiliates.js";
import { applyTrackingCode } from "../api/_lib/tracking.js";

// Every link below is a real one from this account's Digistore24 affiliations,
// checked in a browser. The vendor decides a promolink's shape and Digistore24
// enforces it -- many refuse www.digistore24.com ("Incorrect domain in the
// link") and require their own domain -- so a pasted link must survive
// untouched.

const AFF = "Here4_you";

// The value that sent 50 clicks to a Digistore24 403: a vendor link wrapped
// whole into a promolink as though it were a product number.
const WRAPPED = "https://www.digistore24.com/redir/https://hydroleanxt.com/ds/go/indexvs.php#aff=Here4_you/Here4_you/";

test("a bare product number becomes the standard promolink under the user's ID", () => {
  assert.deepEqual(parseDigistoreInput("533952", AFF), {
    url: "https://www.digistore24.com/redir/533952/Here4_you/",
    productId: "533952",
    error: null,
  });
});

test("a promolink on the vendor's own domain is kept exactly, not moved to digistore24.com", () => {
  // Digistore24 refuses www.digistore24.com/redir/581314/... for this vendor.
  const link = "https://digital-success.pages.dev/redir/581314/Here4_you/";
  assert.deepEqual(parseDigistoreInput(link, AFF), { url: link, productId: "581314", error: null });
});

test("a checkout-ds24.com promolink is kept exactly", () => {
  // The one domain this vendor accepts; it lands on their page with ?aff=.
  const link = "https://www.checkout-ds24.com/redir/576752/Here4_you/";
  assert.deepEqual(parseDigistoreInput(link, AFF), { url: link, productId: "576752", error: null });
});

test("a vendor's own page carrying #aff= is kept exactly", () => {
  // HydroLean XT's working affiliate link; its /redir/ domain is a 404.
  const link = "https://hydroleanxt.com/ds/go/indexvs.php#aff=Here4_you";
  assert.deepEqual(parseDigistoreInput(link, AFF), { url: link, productId: null, error: null });
});

test("the wrapped-URL shape that sent 50 clicks to a 403 is refused", () => {
  assert.ok(parseDigistoreInput(WRAPPED, AFF).error);
});

test("a vendor page with no affiliate ID is refused, since it would credit nobody", () => {
  assert.match(parseDigistoreInput("https://hydroleanxt.com/ds/go/indexvs.php", AFF).error, /no affiliate ID/);
});

test("a digistore24.com link without a product number is refused", () => {
  assert.ok(parseDigistoreInput("https://www.digistore24.com/redir/", AFF).error);
});

test("text that is neither a number nor a link is refused", () => {
  assert.ok(parseDigistoreInput("HydroLean XT", AFF).error);
  assert.ok(parseDigistoreInput("", AFF).error);
  assert.ok(parseDigistoreInput("javascript:alert(1)//aff=x", AFF).error);
});

test("only real product numbers pass, so the trending sync skips placeholders", () => {
  assert.equal(isDigistoreProductId("571423"), true);
  assert.equal(isDigistoreProductId(" 571423 "), true);
  assert.equal(isDigistoreProductId(571423), true);
  assert.equal(isDigistoreProductId("VERIFY_IN_MARKETPLACE"), false);
  assert.equal(isDigistoreProductId(""), false);
  assert.equal(isDigistoreProductId(undefined), false);
});

test("a vendor-page link carries our code as cam, and keeps its #aff", () => {
  // digistore.js on the vendor page reads aff and cam from hash or query and
  // carries both to checkout -- confirmed in a browser -- so cam is what makes
  // {campaignkey} come back on the sale.
  const out = new URL(applyTrackingCode("https://hydroleanxt.com/ds/go/indexvs.php#aff=Here4_you", "ds_hydroleanxt", "digistore24"));
  assert.equal(out.searchParams.get("cam"), "dshydroleanxt");
  assert.equal(out.searchParams.get("sid1"), "dshydroleanxt");
  assert.equal(out.hash, "#aff=Here4_you");
});

test("a promolink on a vendor domain gets the code in its path, not as cam", () => {
  const out = new URL(applyTrackingCode("https://digital-success.pages.dev/redir/581314/Here4_you/", "ds_581314", "digistore24"));
  assert.equal(out.hostname, "digital-success.pages.dev");
  assert.equal(out.pathname, "/redir/581314/Here4_you/ds581314");
  assert.equal(out.searchParams.get("cam"), null);
});
