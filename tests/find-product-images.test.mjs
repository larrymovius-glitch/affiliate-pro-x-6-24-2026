import assert from "node:assert/strict";
import test from "node:test";
import { executeTool, TOOL_DEFINITIONS } from "../api/_lib/assistantTools.js";
import { unsafePageReason, cleanPageUrl, extractImageCandidates, findVendorImage } from "../api/_lib/productImages.js";

// Only eBay sends a picture with its products, so every Digistore24 and
// ClickBank product sat without one and the owner -- whose client can't go
// hunting for pictures -- had to find each by hand. Maya now reads the
// vendor's own sharing picture off their sales page.
//
// What these pin down, above all: it never makes an affiliate click. The owner
// has one account suspended already and said plainly that guessing could get
// him banned from the networks too.

const PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Advanced Amino">
<meta property="og:image" content="/images/amino-bottle.png">
<meta name="twitter:image" content="https://cdn.vendor.test/tw.jpg">
</head><body>hi</body></html>`;

/** A fake network: records every address requested, answers from a table. */
function fakeWeb(routes) {
  const requested = [];
  const fetch = async (url) => {
    requested.push(String(url));
    const r = routes[String(url)];
    if (!r) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    return typeof r === "function" ? r() : r;
  };
  return { fetch, requested };
}

const html = (body) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const picture = (bytes = 250_000) =>
  new Response("x", { status: 206, headers: { "content-type": "image/png", "content-range": `bytes 0-0/${bytes}` } });

test("affiliate links and trackers are refused before any request is made", () => {
  for (const url of [
    "https://someaffiliate.javaburn.hop.clickbank.net/",
    "https://hop.clickbank.net/?affiliate=someaffiliate&vendor=javaburn",
    "https://www.digistore24.com/redir/123456/Aff_ID/",
    "https://bit.ly/abc",
    "https://apx.amhere4utoday.com/r/ABC123",
  ]) {
    assert.ok(unsafePageReason(url, "apx.amhere4utoday.com"), url);
  }
  for (const url of ["http://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "file:///etc/passwd", "https://intranet/x"]) {
    assert.ok(unsafePageReason(url), url);
  }
  assert.equal(unsafePageReason("https://www.advancedbionutritionals.com/DS24/Advanced-Amino/HD.htm#aff=Aff_ID"), null);
});

test("the page is fetched with every affiliate id removed", () => {
  assert.equal(
    cleanPageUrl("https://www.advancedbionutritionals.com/DS24/Advanced-Amino/HD.htm?cam=ABC123&aff=Aff_ID#aff=Aff_ID"),
    "https://www.advancedbionutritionals.com/DS24/Advanced-Amino/HD.htm"
  );
});

test("reads the vendor's sharing picture, best first, made absolute", () => {
  const found = extractImageCandidates(PAGE, "https://vendor.test/sales/page.htm");
  assert.deepEqual(found[0], { url: "https://vendor.test/images/amino-bottle.png", via: "og:image" });
  assert.equal(found[1].url, "https://cdn.vendor.test/tw.jpg");
});

test("finds a picture without the affiliate id ever leaving the server", async () => {
  const web = fakeWeb({
    "https://vendor.test/sales/page.htm": html(PAGE),
    "https://vendor.test/images/amino-bottle.png": picture(),
  });
  const r = await findVendorImage("https://vendor.test/sales/page.htm?cam=X1#aff=Aff_ID", { fetch: web.fetch });
  assert.equal(r.image_url, "https://vendor.test/images/amino-bottle.png");
  assert.ok(web.requested.every((u) => !/aff|cam=|Aff_ID/.test(u)), web.requested.join(" "));
});

test("a redirect into a tracker is not followed", async () => {
  const web = fakeWeb({
    "https://vendor.test/p": () => new Response(null, { status: 302, headers: { location: "https://someaffiliate.vendor.hop.clickbank.net/" } }),
  });
  const r = await findVendorImage("https://vendor.test/p", { fetch: web.fetch });
  assert.match(r.error, /ClickBank HopLink/);
  assert.deepEqual(web.requested, ["https://vendor.test/p"]);
});

test("a sales page with no sharing picture falls back to its product shot", async () => {
  // Shaped like the real Advanced Amino page: no og:image, a logo first, then
  // the bottle, then the label and a review.
  const page = `
    <img src="https://assets.vendor.test/Logo/Logo-White.png" alt="Vendor Logo">
    <img id="frtImg" src="//assets.vendor.test/amino-guarantee.jpg" alt="Advanced Amino Formula with guarantee">
    <img src="//assets.vendor.test/ingredients-label.jpg" alt="Advanced Amino Formula supplement facts">
    <img src="//assets.vendor.test/customer-review.jpg" alt="Advanced Amino Formula customer review">`;
  const web = fakeWeb({
    "https://vendor.test/p": html(page),
    "https://assets.vendor.test/amino-guarantee.jpg": picture(),
  });
  const r = await findVendorImage("https://vendor.test/p", { fetch: web.fetch, productName: "Advanced Amino Formula" });
  assert.equal(r.image_url, "https://assets.vendor.test/amino-guarantee.jpg");
  assert.equal(r.found_via, "product shot on the page");
});

test("a labelled bottle shot beats a sharing picture that is a video thumbnail", async () => {
  // Shaped like HepatoBurn's page: og:image is the sales video's thumbnail.
  const page = `
    <meta property="og:image" content="https://hb.test/images/og-image-1.png">
    <img src="/images/hepatoburn/logo.png" alt="HEPATO BURN">
    <img src="/images/hepatoburn/2-bottle.png" alt="2 bottles">`;
  const web = fakeWeb({
    "https://hb.test/p": html(page),
    "https://hb.test/images/hepatoburn/2-bottle.png": picture(),
    "https://hb.test/images/og-image-1.png": picture(),
  });
  const r = await findVendorImage("https://hb.test/p", { fetch: web.fetch, productName: "HepatoBurn" });
  assert.equal(r.image_url, "https://hb.test/images/hepatoburn/2-bottle.png");
});

test("a pixel or a favicon is not a product picture", async () => {
  const web = fakeWeb({
    "https://vendor.test/p": html('<meta property="og:image" content="https://vendor.test/pixel.gif">'),
    "https://vendor.test/pixel.gif": picture(43),
  });
  const r = await findVendorImage("https://vendor.test/p", { fetch: web.fetch });
  assert.ok(r.error);
});

// ---- the tool ----

function fakeDb(products) {
  const updates = [];
  return {
    updates,
    Product: {
      filter: async (f) => products.filter((p) => Object.entries(f).every(([k, v]) => p[k] === v)),
      update: async (id, patch) => {
        updates.push({ id, patch });
        return Object.assign(products.find((p) => p.id === id), patch);
      },
    },
  };
}

const catalogue = () => [
  { id: "ds", created_by_id: "me", name: "Advanced Amino", url: "https://vendor.test/p#aff=Aff_ID", image_url: "" },
  { id: "cb", created_by_id: "me", name: "Java Burn", category: "clickbank_trending", url: "https://someaffiliate.javaburn.hop.clickbank.net/", image_url: "" },
  { id: "has", created_by_id: "me", name: "PS5", url: "https://www.ebay.com/itm/1", image_url: "https://i.ebayimg.com/x/s-l1600.jpg" },
  { id: "theirs", created_by_id: "someone-else", name: "Theirs", url: "https://vendor.test/p", image_url: "" },
];

const redirect = (to, status = 307) => () => new Response(null, { status, headers: { location: to } });

// Shaped like the real answers: ClickBank sends an affiliate-less HopLink to
// the vendor's /go with hop=0; Digistore24 bounces once through its checkout
// domain, then on to the vendor.
const web = () =>
  fakeWeb({
    "https://vendor.test/p": () => html(PAGE.replace("/images/amino-bottle.png", "https://vendor.test/a.png")),
    "https://vendor.test/a.png": () => picture(),
    "https://hop.clickbank.net/?vendor=javaburn": redirect("https://javaburn.test/go?hop=0&hopId=abc"),
    "https://javaburn.test/go?hop=0&hopId=abc": redirect("https://javaburn.test/sales?hop=0&hopId=abc", 302),
    "https://javaburn.test/sales?hop=0&hopId=abc": () => html('<meta property="og:image" content="https://javaburn.test/jb.jpg">'),
    "https://javaburn.test/sales": () => html('<meta property="og:image" content="https://javaburn.test/jb.jpg">'),
    "https://javaburn.test/jb.jpg": () => picture(),
    "https://www.digistore24.com/redir/533952/": redirect("https://www.checkout-ds24.com/redir/533952/?ds24_domain=www.digistore24.com", 301),
    "https://www.checkout-ds24.com/redir/533952/?ds24_domain=www.digistore24.com": redirect("https://lipo.test/index.php?aff=&cam="),
    "https://lipo.test/index.php": () => html('<meta property="og:image" content="https://lipo.test/bottle.png">'),
    "https://lipo.test/bottle.png": () => picture(),
  });

const me = { id: "me", clickbank_nickname: "someaffiliate", affiliate_network_ids: { digistore24: "Aff_ID" } };
const ctx = (D, w) => ({ user: me, D, origin: "https://apx.amhere4utoday.com", fetch: w.fetch });

/** No request may carry the user's ids -- the whole point. */
const noIdsSent = (w) =>
  assert.ok(w.requested.every((u) => !/someaffiliate|Aff_ID|Here4_you|apxalaska/i.test(u)), w.requested.join(" "));

test("find_product_images is offered to the assistant", () => {
  assert.ok(TOOL_DEFINITIONS.some((t) => t.name === "find_product_images"));
});

test("previews every product missing a picture and saves nothing", async () => {
  const D = fakeDb(catalogue());
  const w = web();
  const r = await executeTool("find_product_images", {}, ctx(D, w));

  assert.equal(D.updates.length, 0, "nothing saved without approval");
  assert.deepEqual(r.results.map((x) => x.product_id).sort(), ["cb", "ds"], "only my products, only ones without a picture");
  assert.equal(r.results.find((x) => x.product_id === "ds").image_url, "https://vendor.test/a.png");
  noIdsSent(w);
});

test("a ClickBank HopLink is opened rebuilt without the affiliate, never as saved", async () => {
  const D = fakeDb(catalogue());
  const w = web();
  const r = await executeTool("find_product_images", { product_ids: ["cb"] }, ctx(D, w));
  assert.equal(r.results[0].image_url, "https://javaburn.test/jb.jpg");
  assert.equal(w.requested[0], "https://hop.clickbank.net/?vendor=javaburn");
  noIdsSent(w);
});

test("a Digistore24 promolink is opened without the affiliate, through its checkout hop", async () => {
  const D = fakeDb([
    { id: "lipo", created_by_id: "me", name: "LipoSlend", category: "digistore24", url: "https://www.digistore24.com/redir/533952/Aff_ID//", image_url: "" },
  ]);
  const w = web();
  const r = await executeTool("find_product_images", {}, ctx(D, w));
  assert.equal(r.results[0].image_url, "https://lipo.test/bottle.png");
  assert.equal(w.requested[0], "https://www.digistore24.com/redir/533952/");
  noIdsSent(w);
});

test("a promolink on a vendor's custom domain is rebuilt too, not opened with the id in its path", async () => {
  const D = fakeDb([
    { id: "adhd", created_by_id: "me", name: "Calm ADHD", category: "digistore24", url: "https://aanchorbiz.test/redir/533952/Aff_ID//", image_url: "" },
  ]);
  const w = web();
  await executeTool("find_product_images", {}, ctx(D, w));
  assert.equal(w.requested[0], "https://www.digistore24.com/redir/533952/");
  noIdsSent(w);
});

test("backstop: an address with the user's id anywhere in it is never requested", async () => {
  const D = fakeDb([
    { id: "x", created_by_id: "me", name: "Mystery", category: "general", url: "https://tracker.test/go/Aff_ID/123", image_url: "" },
  ]);
  const w = web();
  const r = await executeTool("find_product_images", {}, ctx(D, w));
  assert.match(r.results[0].error, /affiliate ID is inside the address/);
  assert.equal(w.requested.length, 0);
});

test("an encrypted HopLink and a broken promolink are explained, not opened", async () => {
  const D = fakeDb([
    { id: "enc", created_by_id: "me", name: "Water Freedom", category: "general", url: "https://2932f2ztddoo-91gljhlinczeq.hop.clickbank.net", image_url: "" },
    { id: "bad", created_by_id: "me", name: "Memory", category: "digistore24", url: "https://www.digistore24.com/redir/Aff_ID/Aff_ID/", image_url: "" },
  ]);
  const w = web();
  const r = await executeTool("find_product_images", {}, ctx(D, w));
  assert.match(r.results.find((x) => x.product_id === "enc").error, /encrypted ClickBank HopLink/);
  assert.match(r.results.find((x) => x.product_id === "bad").error, /broken Digistore24 link/);
  assert.equal(w.requested.length, 0);
});

test("saves only when told to, after approval", async () => {
  const D = fakeDb(catalogue());
  const r = await executeTool("find_product_images", { product_ids: ["ds"], save: true }, ctx(D, web()));
  assert.equal(r.saved, 1);
  assert.deepEqual(D.updates, [{ id: "ds", patch: { image_url: "https://vendor.test/a.png", image_source: "sales_page" } }]);
});

test("a product works from the vendor's own page the user gives", async () => {
  const D = fakeDb(catalogue());
  const r = await executeTool("find_product_images", { product_ids: ["cb"], page_url: "https://javaburn.test/sales" }, ctx(D, web()));
  assert.equal(r.results[0].image_url, "https://javaburn.test/jb.jpg");
});

test("someone else's product is never looked up or changed", async () => {
  const D = fakeDb(catalogue());
  const w = web();
  const r = await executeTool("find_product_images", { product_ids: ["theirs"], save: true }, ctx(D, w));
  assert.match(r.error, /None of those ids/);
  assert.equal(w.requested.length, 0);
  assert.equal(D.updates.length, 0);
});
