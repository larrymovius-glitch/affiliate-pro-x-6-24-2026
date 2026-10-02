import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../api/_lib/assistantTools.js";
import { FDA_DISCLAIMER, tiktokPostingChecklist, tiktokRule, vendorCreativeCheck } from "../api/_lib/platformRules.js";
import { adFormat, suggestedAdCaption } from "../api/_lib/videoAds.js";

// TikTok's Branded Content Policy covers every post with an affiliate link. A
// banned product gets the video pulled and the account marked, so these use
// the owner's real product names as they stood on 2026-09-26: getting one of
// them wrong is the mistake that matters.

const BANNED = [
  "HydroLean XT Gold",
  "LipoSlend - 6 Bottles + 2 Free Ebooks",
  "Sumatra Slim Belly Tonic",
  "Java Burn",
  "HepatoBurn",
  "AI Wealth Profit $67 V1",
  "Digital Wealth Academy",
  "MAIN - Click Wealth System",
  "Perpetual Income 365",
];

const RESTRICTED = [
  "Advanced Amino Formula",
  "Advanced Memory Formula",
  "ProDentim",
  "Nervovive - 1 Bottle",
  "ProstaVive",
  "audifort",
  "MAIN 1 - Glucotrust 1 bottle",
  "MAIN 3 - Gluco care - 6 bottles - $294",
];

const ALLOWED = [
  "Heal Your Parent Wound",
  "No Grid Survival Projects",
  "Water Freedom System",
  "The Calm ADHD Blueprint - EBook",
];

for (const name of BANNED) {
  test(`TikTok bans "${name}"`, () => assert.equal(tiktokRule({ name }).status, "banned"));
}
for (const name of RESTRICTED) {
  test(`TikTok restricts "${name}"`, () => assert.equal(tiktokRule({ name }).status, "restricted"));
}
for (const name of ALLOWED) {
  test(`TikTok allows "${name}"`, () => assert.equal(tiktokRule({ name }).status, "allowed"));
}

test("a weight-loss claim in the description is caught even when the name is innocent", () => {
  assert.equal(tiktokRule({ name: "Morning Blend", description: "Supports healthy weight loss" }).status, "banned");
});

test("eBay merchandise is not keyword-matched: slim-fit jeans are not a diet pill", () => {
  assert.equal(tiktokRule({ name: "Levi's 511 Slim Fit Jeans" }, { isEbay: true }).status, "allowed");
});

test("the posting checklist always asks for the branded-content switch, and adults-only for supplements", () => {
  assert.match(tiktokPostingChecklist({ status: "allowed" }).join(" "), /Branded content/);
  assert.doesNotMatch(tiktokPostingChecklist({ status: "allowed" }).join(" "), /18\+/);
  assert.match(tiktokPostingChecklist({ status: "restricted" }).join(" "), /18\+/);
});

// --- what Maya does with it ---

function fakeDb(products) {
  return {
    Product: {
      filter: async (f) => products.filter((p) => Object.entries(f).every(([k, v]) => p[k] === v)),
    },
  };
}

function videoAdsSpy() {
  const renders = [];
  return {
    renders,
    lib: {
      adFormat,
      suggestedAdCaption,
      videoAdsConfigured: () => true,
      synthesizeSpeechBuffer: async () => Buffer.from(""),
      uploadPublicAsset: async () => "https://uploads.test/a.mp3",
      estimateDurationSeconds: () => 12,
      submitAdVideoRender: async (args) => { renders.push(args); return "render-1"; },
    },
  };
}

const product = (name, extra = {}) => ({
  id: "p1", created_by_id: "me", name, image_url: "https://x.com/i.png", url: "https://example.com", creative_rule: "any", ...extra,
});

test("Maya refuses a TikTok ad for a banned product without spending a render", async () => {
  const spy = videoAdsSpy();
  let wrote = false;
  const out = await executeTool("create_video_ad", { product_id: "p1" }, {
    user: { id: "me" },
    D: fakeDb([product("HydroLean XT Gold")]),
    videoAds: spy.lib,
    invokeLLM: async () => { wrote = true; return { text: "x" }; },
  });
  assert.match(out.error, /Not made/);
  assert.equal(out.tiktok, "banned");
  assert.equal(spy.renders.length, 0);
  assert.equal(wrote, false, "no script is written either");
});

test("a supplement ad gets mild-wording instructions, the FDA line and the adults-only step", async () => {
  const spy = videoAdsSpy();
  const prompts = [];
  const out = await executeTool("create_video_ad", { product_id: "p1" }, {
    user: { id: "me" },
    D: fakeDb([product("Advanced Amino Formula")]),
    videoAds: spy.lib,
    storageClient: {},
    invokeLLM: async ({ prompt }) => { prompts.push(prompt); return { text: "script" }; },
  });
  assert.equal(spy.renders.length, 1);
  assert.match(prompts[0], /dietary supplement/);
  assert.ok(out.suggested_caption.endsWith(FDA_DISCLAIMER));
  assert.equal(out.tiktok, "restricted");
  assert.match(out.posting_checklist.join(" "), /18\+/);
});

test("an eBay ad has no FDA line and still gets the branded-content step", async () => {
  const spy = videoAdsSpy();
  const out = await executeTool("create_video_ad", { product_id: "p1" }, {
    user: { id: "me" },
    D: fakeDb([product("Quasi-Collagen Glow Up Facial Mask", { url: "https://www.ebay.com/itm/1", category: "ebay_trending" })]),
    videoAds: spy.lib,
    storageClient: {},
    invokeLLM: async () => ({ text: "script" }),
  });
  assert.equal(out.tiktok, "allowed");
  assert.doesNotMatch(out.suggested_caption, /FDA/);
  assert.match(out.posting_checklist.join(" "), /Branded content/);
});

test("list_my_products tells Maya what TikTok allows for each product", async () => {
  const D = {
    Product: { filter: async () => [product("Java Burn"), { ...product("ProDentim"), id: "p2" }] },
  };
  const out = await executeTool("list_my_products", {}, { user: { id: "me" }, D });
  assert.deepEqual(out.products.map((p) => p.tiktok), ["banned", "restricted"]);
});

// --- the vendor's own creative rules ---

test("a vendor product whose rules haven't been checked gets no ad", () => {
  const r = vendorCreativeCheck({ name: "Gluco care", image_source: "official" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /haven't been checked/);
});

test("a sales-page picture is refused for a vendor that allows only own or official creatives", () => {
  const nervovive = { name: "Nervovive", creative_rule: "own_or_official", image_source: "sales_page" };
  assert.equal(vendorCreativeCheck(nervovive).ok, false);
  assert.equal(vendorCreativeCheck(nervovive, { footage: true }).ok, true, "the owner's own footage is fine");
});

test("an unconfirmed picture is refused too: a new picture has no known source", () => {
  assert.equal(vendorCreativeCheck({ name: "ProstaVive", creative_rule: "own_or_official", image_source: null }).ok, false);
});

test("the owner's own picture and an affiliate-kit picture both pass own_or_official", () => {
  assert.equal(vendorCreativeCheck({ name: "Advanced Amino", creative_rule: "own_or_official", image_source: "own" }).ok, true);
  assert.equal(vendorCreativeCheck({ name: "ProDentim", creative_rule: "own_or_official", image_source: "official" }).ok, true);
});

test("official_only allows the vendor's kit and nothing else, footage included", () => {
  const hepato = { name: "HepatoBurn", creative_rule: "official_only", image_source: "own" };
  assert.equal(vendorCreativeCheck(hepato).ok, false, "not even the owner's own picture");
  assert.equal(vendorCreativeCheck(hepato, { footage: true }).ok, false, "nor the owner's own clip");
  assert.equal(vendorCreativeCheck(hepato, { footage: true, footageIsOfficial: true }).ok, true);
  assert.equal(vendorCreativeCheck({ ...hepato, image_source: "official" }).ok, true);
});

test("a vendor that wants its ads posted unaltered gets no AI ad at all", () => {
  const r = vendorCreativeCheck({ name: "X", creative_rule: "unaltered", image_source: "official" }, { footage: true, footageIsOfficial: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /exactly as supplied/);
});

test("eBay listings are not held to vendor creative rules", () => {
  assert.equal(vendorCreativeCheck({ name: "Galaxy Buds" }, { isEbay: true }).ok, true);
});

test("Maya refuses an ad that breaks the vendor's creative rules, without spending a render", async () => {
  const spy = videoAdsSpy();
  const out = await executeTool("create_video_ad", { product_id: "p1" }, {
    user: { id: "me" },
    D: fakeDb([product("Nervovive - 1 Bottle", { creative_rule: "own_or_official", image_source: "sales_page", creative_rule_note: "No AI deepfakes." })]),
    videoAds: spy.lib,
    invokeLLM: async () => ({ text: "x" }),
  });
  assert.match(out.error, /sales page/);
  assert.equal(out.vendor_rules, "No AI deepfakes.");
  assert.equal(spy.renders.length, 0);
});
