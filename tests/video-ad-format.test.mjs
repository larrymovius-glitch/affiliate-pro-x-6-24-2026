import assert from "node:assert/strict";
import test from "node:test";
import { AD_DISCLOSURE, adFormat, buildMovie, suggestedAdCaption } from "../api/_lib/videoAds.js";
import { largestEbayImage } from "../api/_lib/images.js";

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

test("the ad is built from the product's own photo", () => {
  assert.equal(byType(movie(), "image").src, "https://img.test/product.jpg");
});

test("the product name sits clear of TikTok's own interface", () => {
  // TikTok covers the bottom of the screen with the poster's name and caption,
  // and the right edge with the like/comment/share buttons.
  const text = byType(movie(), "text");
  assert.equal(text.y, "8%");
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

test("the whole product stays in frame instead of being cropped away", () => {
  // "cover" on a square product photo in a 9:16 frame crops a third of the
  // width -- half the LEGO box, or the label off a bottle.
  const image = byType(movie(), "image");
  assert.equal(image.resize, "fit");
  assert.ok(image.width <= 1080);
  assert.equal(byType(movie(), "image").zoom, 2, "a push-in, not a lurch");
  assert.equal(movie().scenes[0]["background-color"], "#0B0B10", "a chosen backdrop, not default black");
});

test("the voiceover is also written on screen, because most people watch muted", () => {
  const subs = byType(movie(), "subtitles");
  assert.ok(subs, "captions are on by default");
  assert.equal(subs.settings.style, "classic-progressive");
  assert.ok(subs.settings["outline-width"] > 0, "readable over a photo");
  assert.ok(subs.settings.y < 1920 * 0.85, "clear of TikTok's own caption bar");
});

test("captions can be left off for a video that will be edited in CapCut", () => {
  const m = movie({ captions: false });
  assert.equal(byType(m, "subtitles"), undefined);
  // Everything else still there -- it is the same ad, minus burned-in text.
  assert.ok(byType(m, "image") && byType(m, "audio") && byType(m, "text"));
});

test("every ad carries the disclosure on the picture itself", () => {
  // Digistore24's terms ban undisclosed AI-generated promotional content, and
  // the FTC wants the commission disclosed where the recommendation is. On the
  // frame, so it survives a download, a re-edit and a repost.
  const shown = elements(movie()).filter((e) => e.type === "text").map((e) => e.text);
  assert.ok(shown.includes(AD_DISCLOSURE));
  assert.match(AD_DISCLOSURE, /AI-generated/i);
  assert.match(AD_DISCLOSURE, /[Aa]ffiliate/);
});

test("the disclosure stays out of the area the app covers, in every shape", () => {
  for (const format of ["vertical", "square", "landscape"]) {
    const m = movie({ format });
    const line = elements(m).find((e) => e.type === "text" && e.text === AD_DISCLOSURE);
    assert.ok(parseFloat(line.y) < 20, `${format}: ${line.y} is in the top fifth`);
  }
});

test("the disclosure survives turning captions off for CapCut", () => {
  // The edited version is the one most likely to be posted, so it must not be
  // the one that loses the disclosure.
  const texts = elements(movie({ captions: false })).filter((e) => e.type === "text").map((e) => e.text);
  assert.ok(texts.includes(AD_DISCLOSURE));
});

test("the suggested caption says #ad, the commission, and that it is AI-made", () => {
  const caption = suggestedAdCaption("Advanced Amino Formula");
  assert.match(caption, /#ad/);
  assert.match(caption, /commission/i);
  assert.match(caption, /AI-generated/i);
  assert.match(caption, /Advanced Amino Formula/);
  assert.match(caption, /Link in bio/);
  assert.match(suggestedAdCaption("X", "apx.amhere4utoday.com/go/apx"), /go\/apx/);
});

test("a network's logo is shown only when there is one, and never in the app's own corners", () => {
  const plain = movie();
  assert.equal(elements(plain).filter((e) => e.type === "image").length, 1, "product photo only");

  const branded = movie({ badgeUrl: "https://apx.test/brand/ebay-logo.png" });
  const badge = elements(branded).filter((e) => e.type === "image").find((e) => e.src.includes("ebay-logo"));
  assert.ok(badge);
  assert.equal(badge.x, "center", "corners belong to TikTok's buttons and caption");
  assert.equal(badge.width, badge.height, "square as supplied -- eBay requires their logo unaltered");
  assert.ok(badge.width <= 1080 * 0.12, "a mark, not a billboard");
});

test("footage replaces the still photo and is silenced and looped", () => {
  // A clip from Firefly or a phone is 8 seconds; the script runs 15-20. It
  // loops rather than freezing, and its own audio must not talk over the
  // voiceover.
  const m = movie({ videoUrl: "https://uploads.test/firefly.mp4", duration: 18 });
  const clip = byType(m, "video");
  assert.ok(clip, "the backdrop is the footage");
  assert.equal(byType(m, "image"), undefined, "no still photo behind it");
  assert.equal(clip.resize, "cover", "footage fills the frame");
  assert.equal(clip.muted, true);
  assert.equal(clip.loop, -1);
  assert.equal(clip.duration, 18);
});

test("an ad with footage still carries voiceover, captions and disclosure", () => {
  const m = movie({ videoUrl: "https://uploads.test/firefly.mp4", badgeUrl: "https://apx.test/brand/ebay-logo.png" });
  assert.ok(byType(m, "audio"), "the voiceover still plays");
  assert.ok(byType(m, "subtitles"), "captions still burn in");
  const texts = elements(m).filter((e) => e.type === "text").map((e) => e.text);
  assert.ok(texts.includes(AD_DISCLOSURE), "the disclosure is not lost with the photo");
  assert.ok(elements(m).some((e) => e.type === "image" && e.src.includes("ebay-logo")), "the network logo remains");
});
