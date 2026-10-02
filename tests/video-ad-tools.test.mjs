import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../api/_lib/assistantTools.js";
import { adFormat, suggestedAdCaption } from "../api/_lib/videoAds.js";

function fakeDb({ products = [], assets = [] } = {}) {
  const seen = [];
  return {
    seen,
    Product: {
      filter: async (f) => products.filter((p) => Object.entries(f).every(([k, v]) => p[k] === v)),
    },
    AdAsset: {
      create: async (payload) => { seen.push(payload); const row = { id: `asset-${assets.length + 1}`, ...payload }; assets.push(row); return row; },
    },
  };
}

const fakeStorage = () => ({
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "https://uploads.test/audio.mp3" } }),
    }),
  },
});

// adFormat is the real one throughout: which shape an ad is rendered in is
// exactly what these tests are checking, so stubbing it would prove nothing.
const notConfigured = { videoAdsConfigured: () => false, adFormat, suggestedAdCaption };
const configured = {
  adFormat,
  suggestedAdCaption,
  videoAdsConfigured: () => true,
  synthesizeSpeechBuffer: async () => Buffer.from("fake-audio"),
  uploadPublicAsset: async () => "https://uploads.test/audio.mp3",
  estimateDurationSeconds: () => 12,
  submitAdVideoRender: async () => "render-123",
  getRenderStatus: async () => ({ status: "done", url: "https://cdn.test/video.mp4" }),
};

const ctxFor = (D, overrides = {}) => ({
  user: { id: "me" },
  D,
  storageClient: fakeStorage(),
  videoAds: notConfigured,
  invokeLLM: async () => ({ text: "generated script" }),
  ...overrides,
});

test("create_video_ad refuses a product that isn't the caller's", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "other", name: "Theirs", image_url: "https://x.com/i.png" }] });
  const r = await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.match(r.error, /No product of yours/);
});

test("create_video_ad refuses a product with no image", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine" }] });
  const r = await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.match(r.error, /no image/);
});

test("create_video_ad reports plainly when not configured, without attempting a render", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  const r = await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D));
  assert.equal(r.configured, false);
  assert.match(r.error, /isn't set up/);
});

test("create_video_ad writes its own script when none is given, and submits a render", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  const r = await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.equal(r.render_id, "render-123");
  assert.equal(r.script, "generated script");
  assert.equal(r.product_id, "p1");
});

test("create_video_ad uses a caller-supplied script instead of writing one", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  let llmCalled = false;
  const r = await executeTool(
    "create_video_ad",
    { product_id: "p1", script: "Buy this now, it's great." },
    ctxFor(D, { videoAds: configured, invokeLLM: async () => { llmCalled = true; return { text: "unused" }; } })
  );
  assert.equal(r.script, "Buy this now, it's great.");
  assert.equal(llmCalled, false);
});

test("check_video_ad reports still-rendering without creating an asset", async () => {
  const D = fakeDb();
  const r = await executeTool(
    "check_video_ad",
    { render_id: "render-123" },
    ctxFor(D, { videoAds: { ...configured, getRenderStatus: async () => ({ status: "rendering" }) } })
  );
  assert.equal(r.status, "rendering");
  assert.equal(D.seen.length, 0);
});

test("check_video_ad surfaces a failed render as an error, not a saved asset", async () => {
  const D = fakeDb();
  const r = await executeTool(
    "check_video_ad",
    { render_id: "render-123" },
    ctxFor(D, { videoAds: { ...configured, getRenderStatus: async () => ({ status: "failed", error: "bad asset url" }) } })
  );
  assert.equal(r.status, "failed");
  assert.match(r.error, /bad asset url/);
  assert.equal(D.seen.length, 0);
});

test("check_video_ad saves a completed render as an AdAsset owned by the caller", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  const r = await executeTool("check_video_ad", { render_id: "render-123", product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.equal(r.status, "done");
  assert.equal(r.url, "https://cdn.test/video.mp4");
  const insert = D.seen[0];
  assert.equal(insert.created_by_id, "me");
  assert.equal(insert.file_type, "video");
  assert.match(insert.title, /Mine/);
  // ad_assets has no `source` column, and Postgres rejects the whole insert
  // when one is named -- which is why no finished render was ever saved.
  assert.deepEqual(
    Object.keys(insert).filter((k) => !["created_by_id", "title", "file_url", "file_type", "platform", "notes"].includes(k)),
    [],
    "only columns ad_assets actually has"
  );
  assert.equal(insert.platform, "tiktok", "a vertical ad is recorded against where it is for");
  assert.match(insert.notes, /1080x1920/);
});

test("the saved platform is always one the database accepts", async () => {
  // ad_assets.platform has a CHECK constraint. A descriptive phrase written
  // there ("TikTok, Reels, Shorts") failed the insert and threw away a render
  // that had already been paid for and had finished.
  const ALLOWED = ["facebook", "instagram", "tiktok", "twitter", "email", "general"];
  for (const format of ["vertical", "square", "landscape", "nonsense", undefined]) {
    const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
    await executeTool("check_video_ad", { render_id: "r1", product_id: "p1", format }, ctxFor(D, { videoAds: configured }));
    assert.ok(ALLOWED.includes(D.seen[0].platform), `format ${String(format)} gave platform ${D.seen[0].platform}`);
  }
});

test("a finished landscape ad records its shape in its notes", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  await executeTool("check_video_ad", { render_id: "r1", product_id: "p1", format: "landscape" }, ctxFor(D, { videoAds: configured }));
  assert.match(D.seen[0].notes, /1920x1080/);
  assert.match(D.seen[0].notes, /YouTube/);
});

test("create_video_ad renders vertical unless told otherwise, and says which shape it used", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  const submitted = [];
  const videoAds = { ...configured, submitAdVideoRender: async (args) => { submitted.push(args); return "render-123"; } };

  const r = await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D, { videoAds }));
  assert.equal(submitted[0].format, undefined, "no format passed through means the renderer's own default");
  assert.match(r.format, /1080x1920/);

  await executeTool("create_video_ad", { product_id: "p1", format: "square" }, ctxFor(D, { videoAds }));
  assert.equal(submitted[1].format, "square");
});

test("the script is told to use the listing's facts and invent nothing", async () => {
  const D = fakeDb({ products: [{
    id: "p1", created_by_id: "me", name: "Sony PlayStation 5",
    image_url: "https://x.com/i.png", creative_rule: "any",
    description: "eBay trending product — electronics. Condition: New. Ships from: US. Shipping: free",
  }] });
  const prompts = [];
  const videoAds = { ...configured, submitAdVideoRender: async () => "r1" };
  await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D, {
    videoAds,
    invokeLLM: async ({ prompt }) => { prompts.push(prompt); return { text: "script" }; },
  }));

  const prompt = prompts[0];
  assert.match(prompt, /Condition: New/, "the listing's own facts are given to the writer");
  assert.match(prompt, /Ships from: US/);
  assert.match(prompt, /Invent nothing/i);
  assert.match(prompt, /Never state a price/i);
});

test("the voiceover takes a voice and a delivery direction", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  const spoken = [];
  const videoAds = {
    ...configured,
    submitAdVideoRender: async () => "r1",
    synthesizeSpeechBuffer: async (text, voice, instructions) => { spoken.push({ text, voice, instructions }); return Buffer.from(""); },
  };

  await executeTool("create_video_ad", { product_id: "p1", script: "Hello." }, ctxFor(D, { videoAds }));
  assert.deepEqual([spoken[0].voice, spoken[0].instructions], [undefined, undefined], "left to the renderer's own default");

  await executeTool("create_video_ad", { product_id: "p1", script: "Hello.", voice: "onyx", tone: "calm and serious" }, ctxFor(D, { videoAds }));
  assert.equal(spoken[1].voice, "onyx");
  assert.equal(spoken[1].instructions, "calm and serious");
});

// A finished ad only exists for a product that passed TikTok's and the
// vendor's rules, and "link in bio" must lead to it -- so it goes onto the
// share page as part of finishing, not as a step someone has to remember.
function withLinks(D, links) {
  const updates = [];
  D.AffiliateLink = {
    filter: async (f) => links.filter((l) => Object.entries(f).every(([k, v]) => l[k] === v)),
    update: async (id, patch) => { updates.push({ id, patch }); return { id, ...patch }; },
  };
  return updates;
}

test("a finished ad puts its product's link on the share page", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  const updates = withLinks(D, [
    { id: "L1", created_by_id: "me", product_id: "p1", is_active: true, bio_featured_at: null },
    { id: "L2", created_by_id: "other", product_id: "p1", is_active: true, bio_featured_at: null },
  ]);
  const r = await executeTool("check_video_ad", { render_id: "r1", product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.equal(r.share_page, "added");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "L1", "only the caller's own link");
  assert.ok(updates[0].patch.bio_featured_at);
});

test("a product already on the share page is left as it is", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  const updates = withLinks(D, [{ id: "L1", created_by_id: "me", product_id: "p1", is_active: true, bio_featured_at: "2026-09-26T07:00:00Z" }]);
  const r = await executeTool("check_video_ad", { render_id: "r1", product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.equal(r.share_page, "already");
  assert.equal(updates.length, 0);
});

test("a product with no link is reported, not invented", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png", creative_rule: "any" }] });
  withLinks(D, []);
  const r = await executeTool("check_video_ad", { render_id: "r1", product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.equal(r.status, "done", "the ad itself is still saved");
  assert.equal(r.share_page, "no_link");
  assert.match(r.message, /no affiliate link/);
});
