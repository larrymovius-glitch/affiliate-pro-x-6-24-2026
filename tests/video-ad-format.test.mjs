import assert from "node:assert/strict";
import test from "node:test";
import { adFormat, buildMovie } from "../api/_lib/videoAds.js";
import { largestEbayImage } from "../api/syncEbayTrending.js";

// The shape of the video decides whether it can be posted at all. TikTok,
// Reels and Shorts are full-screen 9:16; a 16:9 video posted there is a small
// letterboxed strip in the middle of the phone. Every ad this app rendered
// before was 16:9.

const movie = (over = {}) =>
  buildMovie({
    imageUrl: "https://img.test/product.jpg",
    audioUrl: "https://uploads.test/voice.mp3",
    caption: "Advanced Amino Formula",
    duration: 12,
    ...over,
  });

const elements = (m) => m.scenes[0].elements;
const byType = (m, type) => elements(m).find((e) => e.type === type);

test("an ad is vertical unless another shape is asked for", () => {
  const m = movie();
  assert.equal(m.width, 1080);
  assert.equal(m.height, 1920);
  assert.equal(m.resolution, "custom");
});

test("an unknown or empty format falls back to vertical rather than failing", () => {
  for (const format of [undefined, "", "portrait", "9:16", null, 7]) {
    assert.equal(movie({ format }).height, 1920, `format ${String(format)}`);
  }
});

test("square and landscape are available for the platforms that want them", () => {
  assert.deepEqual([movie({ format: "square" }).width, movie({ format: "square" }).height], [1080, 1080]);
  assert.deepEqual([movie({ format: "landscape" }).width, movie({ format: "landscape" }).height], [1920, 1080]);
  assert.equal(movie({ format: "LANDSCAPE" }).width, 1920, "case doesn't matter");
});

test("the product image fills the frame instead of leaving black bars", () => {
  // Product photos are square or landscape; dropped into a 9:16 frame
  // untouched they leave most of the screen empty.
  const image = byType(movie(), "image");
  assert.equal(image.resize, "cover");
  assert.equal(image.src, "https://img.test/product.jpg");
});

test("the caption sits clear of TikTok's own interface", () => {
  // TikTok covers the bottom of the screen with the poster's name and caption,
  // and the right edge with the like/comment/share buttons.
  const text = byType(movie(), "text");
  assert.equal(text.y, "15%");
  assert.equal(text.x, "center");
  assert.ok(parseInt(text.settings["font-size"], 10) >= 48, "readable on a phone held at arm's length");
  assert.ok(text.width <= 1080 * 0.9, "not running under the side buttons");
});

test("the caption stays readable over a pale product photo", () => {
  const text = byType(movie(), "text");
  assert.equal(text.settings.color, "#FFFFFF");
  assert.match(text.settings["text-shadow"], /rgba\(0,0,0/);
});

test("voiceover and caption run for the length of the ad", () => {
  const m = movie({ duration: 17 });
  assert.equal(byType(m, "audio").duration, 17);
  assert.equal(byType(m, "text").duration, 17);
  assert.equal(byType(m, "image").duration, 17);
});

test("adFormat names where each shape is meant to be posted", () => {
  assert.match(adFormat("vertical").where, /TikTok/);
  assert.match(adFormat("square").where, /Instagram/);
  assert.match(adFormat("landscape").where, /YouTube/);
});

test("an eBay thumbnail is upgraded to the full-size image before it becomes a video", () => {
  // The Browse API returns a 225px thumbnail; stretched over a 1080x1920 frame
  // that is a blurry mess. Same picture, same path, bigger size.
  assert.equal(
    largestEbayImage("https://i.ebayimg.com/images/g/xKIAAeSwxl5qsLhL/s-l225.jpg"),
    "https://i.ebayimg.com/images/g/xKIAAeSwxl5qsLhL/s-l1600.jpg"
  );
  assert.equal(
    largestEbayImage("https://i.ebayimg.com/images/g/abc/s-l500.webp?x=1"),
    "https://i.ebayimg.com/images/g/abc/s-l1600.webp?x=1"
  );
});

test("an image that isn't one of eBay's sized paths is left exactly as it is", () => {
  for (const url of [
    "https://audifort.com/assets/img/bottle-label.webp",
    "https://i.ebayimg.com/thumbs/images/g/abc/photo.jpg",
    "",
  ]) {
    assert.equal(largestEbayImage(url), url);
  }
  assert.equal(largestEbayImage(null), "");
});
