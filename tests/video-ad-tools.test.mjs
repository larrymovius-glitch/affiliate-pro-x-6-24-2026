import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../api/_lib/assistantTools.js";

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

const notConfigured = { videoAdsConfigured: () => false };
const configured = {
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
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png" }] });
  const r = await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D));
  assert.equal(r.configured, false);
  assert.match(r.error, /isn't set up/);
});

test("create_video_ad writes its own script when none is given, and submits a render", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png" }] });
  const r = await executeTool("create_video_ad", { product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.equal(r.render_id, "render-123");
  assert.equal(r.script, "generated script");
  assert.equal(r.product_id, "p1");
});

test("create_video_ad uses a caller-supplied script instead of writing one", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png" }] });
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
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", image_url: "https://x.com/i.png" }] });
  const r = await executeTool("check_video_ad", { render_id: "render-123", product_id: "p1" }, ctxFor(D, { videoAds: configured }));
  assert.equal(r.status, "done");
  assert.equal(r.url, "https://cdn.test/video.mp4");
  const insert = D.seen[0];
  assert.equal(insert.created_by_id, "me");
  assert.equal(insert.file_type, "video");
  assert.match(insert.title, /Mine/);
});
