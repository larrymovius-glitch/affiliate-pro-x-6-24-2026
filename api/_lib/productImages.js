import net from "node:net";
import { detectNetwork } from "./tracking.js";

// Finds the picture a vendor sets for sharing their own sales page -- the
// og:image a page hands Facebook or iMessage when someone pastes its address.
//
// Only eBay sends a picture with its products (the Browse API). Digistore24 and
// ClickBank send none, so every product from them sat without one, and a video
// ad can't be made without one. The owner builds this app so a disabled client
// doesn't have to go hunting for pictures by hand; this does the hunting.
//
// THE RULE THIS FILE EXISTS AROUND: it never makes an affiliate click. A
// request through a link carrying the owner's affiliate id reads to a network
// as a click, and unannounced test clicks are how an affiliate account gets
// flagged. So:
//   - The page is fetched at origin + path only. Query and fragment are
//     dropped, which is where every network here carries the affiliate id
//     (Digistore24's #aff= never leaves the browser anyway; ClickBank's tid,
//     EPN's campid and customid are query parameters).
//   - Hosts that ARE the affiliate click are refused outright, not stripped:
//     a ClickBank HopLink or a Digistore24 /redir/ link is the click itself,
//     whatever is removed from it. Same for shorteners, which hide where they
//     lead, and for this app's own /r/ links, which count a click.
//   - Redirects are followed by hand, and every hop is held to the same rules,
//     so a vendor page can't bounce the request into a tracker.

const PAGE_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;
const MAX_HTML_CHARS = 1_500_000;
// Below this an "image" is a tracking pixel, a favicon or a tiny logo --
// nothing a 1080x1920 ad can be built on.
const MIN_IMAGE_BYTES = 8 * 1024;

const USER_AGENT = "Mozilla/5.0 (compatible; APX-ImageFinder/1.0; +https://apx.amhere4utoday.com)";

// Redirectors and shorteners. Each one either is an affiliate click or hides
// where it leads, so none of them is fetched.
const TRACKER_HOSTS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly", "cutt.ly", "is.gd", "buff.ly",
  "amzn.to", "shareasale.com", "go.redirectingat.com", "linksynergy.com", "click.linksynergy.com",
  "anrdoezrs.net", "jdoqocy.com", "tkqlhce.com", "dpbolvw.net", "awin1.com", "prf.hn",
  "warriorplus.com", "jvzoo.com", "clickbank.net", "rover.ebay.com",
];

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isPublicHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host.includes(".") && host !== "localhost" && !/\.(local|internal|localhost)$/.test(host) && !net.isIP(host.replace(/^\[|\]$/g, ""));
}

/**
 * Why a page address can't be fetched without risking an affiliate click (or
 * reaching something that isn't a public web page), or null if it can.
 *
 * @param {string} rawUrl
 * @param {string} [ownHost] this app's hostname, whose /r/ links count clicks
 */
export function unsafePageReason(rawUrl, ownHost) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    return "not a web address";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "not a web address";
  const host = url.hostname.toLowerCase();

  if (!isPublicHost(host)) return "not a public web page";
  if (ownHost && hostMatches(host, String(ownHost).toLowerCase())) {
    return "one of this app's own share links -- opening it would count a click";
  }
  const network = detectNetwork(host);
  if (network === "clickbank") {
    return "a ClickBank HopLink -- opening it IS an affiliate click. Needs the vendor's own sales page address instead";
  }
  if (network === "digistore24") {
    return "a Digistore24 link -- opening it IS an affiliate click. Needs the vendor's own sales page address instead";
  }
  if (network === "ebay") return "an eBay listing -- eBay pictures come in with the listing";
  if (TRACKER_HOSTS.some((d) => hostMatches(host, d))) {
    return "a redirect or tracking link -- it hides where it goes, so it isn't opened";
  }
  return null;
}

/** The page address with every affiliate id removed: origin + path, https. */
export function cleanPageUrl(rawUrl) {
  const url = new URL(String(rawUrl).trim());
  return `https://${url.host}${url.pathname}`;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim() : "";
}

// Most specific first: the https copy a page names for sharing, then the
// sharing picture, then what Twitter/X is told, then older conventions.
const META_ORDER = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"];

/**
 * Picture addresses a page names for itself, best first, made absolute.
 *
 * @param {string} html
 * @param {string} pageUrl the address the html came from, for relative paths
 * @returns {{ url: string, via: string }[]}
 */
export function extractImageCandidates(html, pageUrl) {
  const text = String(html || "").slice(0, MAX_HTML_CHARS);
  /** @type {{ url: string, via: string, rank: number }[]} */
  const found = [];

  for (const tag of text.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    const rank = META_ORDER.indexOf(key);
    const content = attr(tag, "content");
    if (rank !== -1 && content) found.push({ url: content, via: key, rank });
  }
  for (const tag of text.match(/<link\b[^>]*>/gi) || []) {
    if (attr(tag, "rel").toLowerCase() === "image_src" && attr(tag, "href")) {
      found.push({ url: attr(tag, "href"), via: "image_src", rank: META_ORDER.length });
    }
  }
  // schema.org Product data: "image": "..." or "image": ["...", ...]
  for (const block of text.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []) {
    const m = block.match(/"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/i);
    if (m) found.push({ url: m[1].replace(/\\\//g, "/"), via: "schema.org", rank: META_ORDER.length + 1 });
  }

  const seen = new Set();
  return resolveCandidates(found.sort((a, b) => a.rank - b.rank), pageUrl, seen);
}

// Pictures on a page that are never the product shot.
const NOT_THE_PRODUCT = /logo|icon|menu|star|review|testimonial|supplement[-_ ]?facts|facts|label|ingredient|chart|badge|arrow|button|avatar|flag|payment|card|secure|spinner|loader|pixel|sprite|placeholder/i;
const LOOKS_LIKE_PRODUCT = /bottle|product|package|packshot|jar|box|pouch|tub|hero|main|frtimg|bundle/i;

/**
 * The page's own product shots, for sales pages that name no sharing picture
 * -- video sales pages mostly don't. Scored by how much the picture's file
 * name and description talk about the product, and skipped when they say it's
 * a logo, an icon, a label, a review or a chart.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @param {string} productName
 * @returns {{ url: string, via: string }[]}
 */
export function extractProductPhotos(html, pageUrl, productName) {
  const text = String(html || "").slice(0, MAX_HTML_CHARS);
  const words = String(productName || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

  const scored = [];
  let order = 0;
  for (const tag of text.match(/<img\b[^>]*>/gi) || []) {
    order += 1;
    const src = attr(tag, "src") || attr(tag, "data-src");
    if (!src || /^data:/i.test(src) || /\.(svg|gif)(\?|$)/i.test(src)) continue;
    const said = `${attr(tag, "alt")} ${src.split("/").pop()} ${attr(tag, "id")} ${attr(tag, "class")}`.toLowerCase();
    if (NOT_THE_PRODUCT.test(said)) continue;
    const named = words.filter((w) => said.includes(w)).length;
    const score = named * 2 + (LOOKS_LIKE_PRODUCT.test(said) ? 2 : 0);
    if (score > 0) scored.push({ url: src, via: "product photo on the page", score, order });
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return resolveCandidates(scored, pageUrl, new Set());
}

function resolveCandidates(found, pageUrl, seen) {
  return found
    .map(({ url, via }) => {
      try {
        const abs = new URL(url, pageUrl);
        if (abs.protocol === "http:") abs.protocol = "https:"; // the renderer needs https
        return abs.protocol === "https:" ? { url: abs.href, via } : null;
      } catch {
        return null;
      }
    })
    .filter((c) => c && !seen.has(c.url) && seen.add(c.url));
}

async function fetchWithTimeout(fetchFn, url, init, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** GET a page, following redirects by hand so every hop passes the same checks. */
async function fetchPage(fetchFn, startUrl, ownHost) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await fetchWithTimeout(
      fetchFn,
      url,
      { redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" } },
      PAGE_TIMEOUT_MS
    );
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { error: `the page redirected with no address (${res.status})` };
      const next = new URL(location, url).href;
      const reason = unsafePageReason(next, ownHost);
      if (reason) return { error: `the page redirected to ${reason}` };
      url = cleanPageUrl(next);
      continue;
    }
    if (!res.ok) return { error: `the page answered ${res.status}` };
    const type = String(res.headers.get("content-type") || "");
    if (type && !/html/i.test(type)) return { error: "that address isn't a web page" };
    return { html: (await res.text()).slice(0, MAX_HTML_CHARS), finalUrl: url };
  }
  return { error: "the page redirected too many times" };
}

/**
 * True when the address serves a real picture, not a pixel or an error page.
 * A picture file carries no affiliate id, so loading one is not a click; it
 * only has to be a public https address.
 */
async function isUsableImage(fetchFn, imageUrl) {
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== "https:" || !isPublicHost(u.hostname)) return false;
  } catch {
    return false;
  }
  try {
    const res = await fetchWithTimeout(
      fetchFn,
      imageUrl,
      { method: "GET", headers: { "user-agent": USER_AGENT, range: "bytes=0-0" } },
      IMAGE_TIMEOUT_MS
    );
    if (!(res.ok || res.status === 206)) return false;
    const type = String(res.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/") || type.includes("svg")) return false;
    // A ranged answer reports the whole size after the slash.
    const range = res.headers.get("content-range");
    const size = Number(range ? range.split("/")[1] : res.headers.get("content-length"));
    try {
      await res.body?.cancel?.();
    } catch {
      // nothing to release
    }
    return !(Number.isFinite(size) && size > 0 && size < MIN_IMAGE_BYTES);
  } catch {
    return false;
  }
}

/**
 * Find the vendor's own sharing picture for one product page.
 *
 * @param {string} pageUrl the product's destination or the vendor's sales page
 * @param {{ fetch?: typeof fetch, ownHost?: string, productName?: string }} [opts]
 *        productName picks the product shot on pages that name no sharing
 *        picture.
 * @returns {Promise<{ image_url: string, found_via: string, page: string } | { error: string, page?: string }>}
 */
export async function findVendorImage(pageUrl, opts = {}) {
  const fetchFn = opts.fetch || fetch;
  const reason = unsafePageReason(pageUrl, opts.ownHost);
  if (reason) return { error: `Not opened: ${reason}.` };

  const page = cleanPageUrl(pageUrl);
  let got;
  try {
    got = await fetchPage(fetchFn, page, opts.ownHost);
  } catch (error) {
    return { error: error?.name === "AbortError" ? "the page took too long to answer" : "the page couldn't be reached", page };
  }
  if (got.error) return { error: got.error, page };

  const shared = extractImageCandidates(got.html, got.finalUrl);
  const photos = extractProductPhotos(got.html, got.finalUrl, opts.productName).filter((p) => !shared.some((s) => s.url === p.url));
  const candidates = [...shared.slice(0, 3), ...photos.slice(0, 3)];
  if (!candidates.length) return { error: "the page has no picture that looks like the product", page };

  for (const c of candidates) {
    if (await isUsableImage(fetchFn, c.url)) {
      return { image_url: c.url, found_via: c.via, page: got.finalUrl };
    }
  }
  return { error: "the pictures the page names didn't load, or were too small to use", page };
}
