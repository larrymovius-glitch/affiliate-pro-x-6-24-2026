import assert from "node:assert/strict";
import test from "node:test";
import { applyTrackingCode, detectNetwork, normalizeTrackingCode } from "../api/_lib/tracking.js";
import { digistorePromoLink } from "../api/_lib/affiliates.js";

// applyTrackingCode decides whether a sale can ever be credited to a link: the
// network only reports a sale back with our code if we put the code where that
// network looks for it. Get the parameter wrong and the click still counts,
// the sale still happens, and the money is attributed to nothing.

// A real EPN link as the Browse API returns it -- customid present but empty.
const EBAY_ITEM =
  "https://www.ebay.com/itm/113883553121?_skw=OBD2+scanner&mkevt=1&mkcid=1" +
  "&mkrid=711-53200-19255-0&campid=5339155721&customid=&toolid=10049";

const params = (u) => new URL(u).searchParams;

test("a Digistore24 promolink gets its campaign key even when mislabelled ClickBank", () => {
  // affiliate_links.network defaults to 'clickbank', and the trending sync
  // created every Digistore24 link without setting it. Trusting that label sent
  // these out with a ClickBank tid and an empty campaign key.
  const out = applyTrackingCode(digistorePromoLink("583224", "Here4_you"), "trend_ds_583224", "clickbank");
  const url = new URL(out);
  assert.equal(url.pathname, "/redir/583224/Here4_you/trendds583224");
  assert.equal(url.searchParams.get("sid1"), "trendds583224");
  assert.equal(url.searchParams.get("tid"), null, "a ClickBank tid means Digistore24 never sees the code");
});

test("an eBay link gets customid even when mislabelled ClickBank", () => {
  const out = applyTrackingCode(EBAY_ITEM, "ebay_trend_obd2_scanner_6gn5", "clickbank");
  assert.equal(params(out).get("customid"), "ebaytrendobd2scanner6gn5");
  assert.equal(params(out).get("tid"), null);
});

test("filling customid keeps every EPN parameter that makes the click earn", () => {
  const p = params(applyTrackingCode(EBAY_ITEM, "ebay_trend_x_ab12", "ebay"));
  assert.equal(p.get("campid"), "5339155721", "without campid the click pays nobody");
  assert.equal(p.get("mkevt"), "1");
  assert.equal(p.get("mkcid"), "1");
  assert.equal(p.get("mkrid"), "711-53200-19255-0");
  assert.equal(p.get("toolid"), "10049");
  assert.equal(p.getAll("customid").length, 1, "set, not appended beside the empty one");
});

test("an eBay link with no stored label is still recognised by its host", () => {
  assert.equal(params(applyTrackingCode(EBAY_ITEM, "ebaylink", "")).get("customid"), "ebaylink");
  assert.equal(params(applyTrackingCode(EBAY_ITEM, "ebaylink", "")).get("subid"), null);
});

test("a ClickBank hoplink gets tid", () => {
  const out = applyTrackingCode("https://apxalaska.vendor.hop.clickbank.net/", "trend_cb_vendor", "clickbank");
  assert.equal(params(out).get("tid"), "trendcbvendor");
});

test("ClickBank's tid is capped at the 50 characters it accepts", () => {
  const out = applyTrackingCode("https://hop.clickbank.net/?affiliate=a&vendor=v", "x".repeat(80), "clickbank");
  assert.equal(params(out).get("tid").length, 50);
});

test("an unrecognised host falls back to the stored label", () => {
  // A ClickBank direct-tracking link points at the vendor's own site, so the
  // host proves nothing and the label has to decide.
  assert.equal(params(applyTrackingCode("https://vendor-site.com/offer", "cbcode", "clickbank")).get("tid"), "cbcode");
  assert.equal(params(applyTrackingCode("https://getnervovive24.com/", "dscode", "digistore24")).get("sid1"), "dscode");
  assert.equal(params(applyTrackingCode("https://shop.example.com/p", "code_1", "")).get("subid"), "code_1");
});

test("lookalike domains are not mistaken for the networks they imitate", () => {
  assert.equal(detectNetwork("ebay.evil.com", ""), "");
  assert.equal(detectNetwork("notebay.com", ""), "");
  assert.equal(detectNetwork("evildigistore24.com", ""), "");
  assert.equal(detectNetwork("hop.clickbank.net.evil.com", ""), "");
});

test("the host outranks the label, and the label only breaks ties", () => {
  assert.equal(detectNetwork("www.ebay.com", "clickbank"), "ebay");
  assert.equal(detectNetwork("www.ebay.co.uk", ""), "ebay");
  assert.equal(detectNetwork("www.digistore24.com", "clickbank"), "digistore24");
  assert.equal(detectNetwork("checkout-ds24.com", "clickbank"), "digistore24");
  assert.equal(detectNetwork("x.y.hop.clickbank.net", "digistore24"), "clickbank");
  assert.equal(detectNetwork("vendor.com", "ClickBank"), "clickbank");
});

test("an unparseable destination is passed through rather than breaking the click", () => {
  assert.equal(applyTrackingCode("not a url", "code", "clickbank"), "not a url");
  assert.equal(applyTrackingCode("", "code", "clickbank"), "");
  assert.equal(applyTrackingCode(EBAY_ITEM, "", "ebay"), EBAY_ITEM);
});

test("codes are normalised the same way the conversion lookup normalises them", () => {
  // trackConversion matches codes punctuation-insensitively; what goes out has
  // to survive the same transform or the match fails.
  assert.equal(normalizeTrackingCode("ebay_trend_levi's_505"), "ebaytrendlevis505");
  assert.equal(normalizeTrackingCode("CB-Vendor"), "cbvendor");
});
