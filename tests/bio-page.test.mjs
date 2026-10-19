import assert from "node:assert/strict";
import test from "node:test";
import { DISCLOSURE, escapeHtml, normalizeHandle, renderBioPage, renderMissingPage, storeLabel } from "../api/_lib/bio.js";

// The share page is the one public page this app serves, opened by strangers
// from a TikTok or Instagram profile. Two things must hold no matter what was
// typed into the Links page: every button goes through /r/ so the click is
// counted and the affiliate id is attached, and nothing a user typed can
// become markup.

const page = (over = {}) =>
  renderBioPage({
    handle: "larry",
    displayName: "Lawrence Movius",
    origin: "https://apx.amhere4utoday.com",
    links: [{ short_code: "easy_advanced_amino_for", product_name: "Advanced Amino" }],
    ...over,
  });

test("a handle is cut down to what is safe in a URL", () => {
  assert.equal(normalizeHandle("Larry"), "larry");
  assert.equal(normalizeHandle("  Larry Movius "), "larry-movius");
  assert.equal(normalizeHandle("larry_movius"), "larry-movius");
  assert.equal(normalizeHandle("larry/../admin"), "larryadmin");
  assert.equal(normalizeHandle("a b"), "a-b");
  assert.equal(normalizeHandle("--larry--"), "larry");
  assert.equal(normalizeHandle("l"), "", "one character is not a handle");
  assert.equal(normalizeHandle("!!!"), "", "nothing usable left");
  assert.equal(normalizeHandle(null), "");
  assert.equal(normalizeHandle("x".repeat(80)).length, 32);
});

test("every button points at the tracked /r/ link, never at the destination", () => {
  // Linking the destination directly would lose the click count, the bot
  // filter and the network's tracking id -- the whole point of the app.
  const html = page();
  assert.ok(html.includes('href="/r/easy_advanced_amino_for"'));
  assert.ok(!html.includes("digistore24"), "no affiliate destination is exposed on a public page");
});

test("a short code with punctuation is URL-encoded in the href", () => {
  const html = page({ links: [{ short_code: "a b&c", product_name: "Odd" }] });
  assert.ok(html.includes('href="/r/a%20b%26c"'));
});

test("what a user typed cannot become markup", () => {
  const html = page({
    displayName: '<script>alert(1)</script>',
    links: [{ short_code: "x1", product_name: '"><img src=x onerror=alert(1)>' }],
  });
  assert.ok(!html.includes("<script>alert"), "name is escaped");
  assert.ok(!html.includes("<img src=x"), "product name is escaped");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("an image URL that is not http(s) is dropped rather than rendered", () => {
  const html = page({
    avatarUrl: "javascript:alert(1)",
    links: [{ short_code: "x1", product_name: "P", image_url: "javascript:alert(1)" }],
  });
  assert.ok(!html.includes("javascript:"));
  const ok = page({ links: [{ short_code: "x1", product_name: "P", image_url: "https://img.test/p.jpg" }] });
  assert.ok(ok.includes('src="https://img.test/p.jpg"'));
});

test("the affiliate disclosure is on the page, above the links", () => {
  // Required by the FTC and by all three networks' terms, and it has to be
  // visible before the click rather than in a footer after it.
  const html = page();
  assert.ok(html.includes(escapeHtml(DISCLOSURE)));
  assert.ok(html.indexOf(DISCLOSURE.slice(0, 20)) < html.indexOf('href="/r/'));
});

test("affiliate buttons are marked sponsored", () => {
  assert.ok(page().includes('rel="sponsored nofollow noopener"'));
});

test("a page with nothing starred still renders, and says so", () => {
  const html = page({ links: [] });
  assert.ok(html.includes("Nothing here yet"));
  assert.ok(!html.includes('href="/r/'));
});

test("a link with no short code is skipped rather than rendered as a dead button", () => {
  const html = page({ links: [{ product_name: "Broken" }, { short_code: "ok1", product_name: "Fine" }] });
  assert.ok(html.includes('href="/r/ok1"'));
  assert.ok(!html.includes("Broken"));
});

test("the page carries what a social preview needs", () => {
  const html = page();
  assert.ok(html.includes('<meta name="viewport"'), "it is opened on a phone");
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('<link rel="canonical" href="https://apx.amhere4utoday.com/go/larry">'));
  assert.ok(!html.includes("<script"), "no scripts: it must paint instantly in an in-app browser");
});

test("a name is only a fallback for a missing one", () => {
  assert.ok(page({ displayName: "" }).includes("@larry"));
});

test("each button says where it leads, without exposing the destination", () => {
  assert.equal(storeLabel("https://www.ebay.com/itm/1?campid=5339155721"), "eBay");
  assert.equal(storeLabel("https://getnervovive24.com/text.php#aff=Here4_you"), "Official site");
  assert.equal(storeLabel("https://notebay.com/x"), "Official site", "a lookalike host is not eBay");
  assert.equal(storeLabel("not a url"), "");
  const html = page({ links: [{ short_code: "e1", product_name: "Air Fryer", store: "eBay" }] });
  assert.ok(html.includes('<span class="store">eBay</span>'));
  assert.ok(!html.includes("ebay.com"));
});

test("a link with no picture still gets a tile instead of a gap", () => {
  assert.ok(page().includes('class="thumb blank"'));
});

test("an unclaimed handle gets a plain page that search engines skip", () => {
  const html = renderMissingPage("https://apx.amhere4utoday.com");
  assert.ok(html.includes("Page not found"));
  assert.ok(html.includes('name="robots" content="noindex"'));
});
