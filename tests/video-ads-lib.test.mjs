import assert from "node:assert/strict";
import test from "node:test";
import { getRenderStatus } from "../api/_lib/videoAds.js";

function withFakeFetch(response, run) {
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => response });
  const originalKey = process.env.JSON2VIDEO_API_KEY;
  process.env.JSON2VIDEO_API_KEY = "test-key";
  return run().finally(() => {
    global.fetch = original;
    process.env.JSON2VIDEO_API_KEY = originalKey;
  });
}

// JSON2Video's real GET /v2/movies?project= response nests status/url under
// `movie`, not at the top level -- every one of these tests uses that real
// shape. A render that had actually finished successfully in ~15 seconds
// was reported as "still rendering" indefinitely because the code read
// body.status (always undefined) instead of body.movie.status.
test("getRenderStatus reads status/url from body.movie, not the top level", async () => {
  await withFakeFetch({ success: true, movie: { status: "done", url: "https://cdn.test/video.mp4" } }, async () => {
    const r = await getRenderStatus("render-1");
    assert.deepEqual(r, { status: "done", url: "https://cdn.test/video.mp4", error: null });
  });
});

test("getRenderStatus maps JSON2Video's error status to failed", async () => {
  await withFakeFetch({ success: true, movie: { status: "error", message: "bad asset url" } }, async () => {
    const r = await getRenderStatus("render-1");
    assert.equal(r.status, "failed");
    assert.equal(r.error, "bad asset url");
  });
});

test("getRenderStatus maps JSON2Video's timeout status to failed, not still-rendering", async () => {
  await withFakeFetch({ success: true, movie: { status: "timeout" } }, async () => {
    const r = await getRenderStatus("render-1");
    assert.equal(r.status, "failed", "a render JSON2Video gave up on must not read as still in progress");
    assert.match(r.error, /timeout/);
  });
});

test("getRenderStatus passes through an in-progress status unchanged", async () => {
  await withFakeFetch({ success: true, movie: { status: "queued" } }, async () => {
    const r = await getRenderStatus("render-1");
    assert.equal(r.status, "queued");
    assert.equal(r.url, null);
  });
});

test("getRenderStatus falls back to a flat top-level shape if the API ever returns one", async () => {
  await withFakeFetch({ status: "done", url: "https://cdn.test/video.mp4" }, async () => {
    const r = await getRenderStatus("render-1");
    assert.equal(r.status, "done");
    assert.equal(r.url, "https://cdn.test/video.mp4");
  });
});
