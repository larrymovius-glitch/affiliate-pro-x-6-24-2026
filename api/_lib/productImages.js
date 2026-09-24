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
// as a click, and repeated artificial clicks are how an affiliate account gets
// flagged. So:
//   - A vendor's own page is fetched at origin + path only. Query and fragment
//     are dropped, which is where most networks carry the affiliate id
//     (Digistore24's #aff=, ClickBank's tid, EPN's campid and customid).
//   - A network link -- a ClickBank HopLink, a Digistore24 /redir/ promolink --
//     is never opened as saved. It is rebuilt WITHOUT an affiliate
//     (hop.clickbank.net/?vendor=X, digistore24.com/redir/<product>/), which
//     the networks answer by sending the visitor to the vendor's page with no
//     one credited -- ClickBank marks it hop=0. The redirect chain is then
//     followed with affiliate parameters stripped at every hop.
//   - Backstop: any address about to be requested that still contains one of
//     the user's affiliate ids anywhere -- path included -- is refused. The
//     first version of this file stripped only query and fragment, and a
//     Digistore24 promolink on a vendor's custom domain
//     (aanchorbiz.com/redir/585674/Here4_you//) went out with the id in its
//     path.
//   - Shorteners, which hide where they lead, and this app's own /r/ links,
//     which count a click, are refused outright.

const PAGE_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 6000;
// A network link without an affiliate takes a few hops to reach the vendor:
// the network, sometimes its checkout domain, the vendor's /go, the page.
const MAX_REDIRECTS = 6;
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
  if (TRACKER_HOSTS.some((d) => hostMatches(host, d)) && !hostMatches(host, "hop.clickbank.net")) {
    return "a redirect or tracking link -- it hides where it goes, so it isn't opened";
  }
  const network = detectNetwork(host);
  if (network === "clickbank") {
    return "a ClickBank HopLink -- opening it as saved IS an affiliate click";
  }
  if (network === "digistore24") {
    return "a Digistore24 link -- opening it as saved IS an affiliate click";
  }
  return null;
}

/** The page address with every affiliate id removed: origin + path, https. */
export function cleanPageUrl(rawUrl) {
  const url = new URL(String(rawUrl).trim());
  return `https://${url.host}${url.pathname}`;
}

const DIGISTORE_HOSTS = ["digistore24.com", "checkout-ds24.com"];

/**
 * A network link rebuilt so it credits no one, or null when the address isn't
 * a network link. `{ error }` when it is one but can't be rebuilt safely.
 *
 *   ClickBank    <aff>.<vendor>.hop.clickbank.net  -> hop.clickbank.net/?vendor=<vendor>
 *                hop.clickbank.net/?affiliate=..&vendor=V -> same
 *                <encrypted>.hop.clickbank.net     -> error: the vendor isn't in it
 *   Digistore24  <any host>/redir/<product>/<aff>/.. -> digistore24.com/redir/<product>/
 *                (vendors' custom domains use the same /redir/ shape; the
 *                product's category says it's Digistore24)
 *
 * @param {string} rawUrl
 * @param {string} [networkHint] the product's category, e.g. "digistore24"
 * @returns {{ url: string } | { error: string } | null}
 */
export function affiliateFreeStart(rawUrl, networkHint) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  if (hostMatches(host, "hop.clickbank.net")) {
    let vendor = "";
    if (host === "hop.clickbank.net") {
      vendor = url.searchParams.get("vendor") || "";
    } else {
      const labels = host.slice(0, -".hop.clickbank.net".length).split(".");
      if (labels.length === 2) vendor = labels[1];
    }
    if (!/^[a-z0-9]{2,20}$/i.test(vendor)) {
      return { error: "an encrypted ClickBank HopLink -- which vendor it's for can't be read from it, so it can't be opened without making a click. Needs the vendor's sales page address, or the vendor's ClickBank nickname from the Marketplace listing" };
    }
    return { url: `https://hop.clickbank.net/?vendor=${vendor.toLowerCase()}` };
  }

  const redir = url.pathname.match(/^\/redir\/([^/]+)/i);
  const isDigistore = DIGISTORE_HOSTS.some((d) => hostMatches(host, d)) || /^digistore24/i.test(String(networkHint || ""));
  if (redir && isDigistore) {
    if (!/^\d+$/.test(redir[1])) {
      return { error: `a broken Digistore24 link -- where the product number belongs it has "${redir[1]}", so it can't lead anywhere or pay anyone. Replace it with the link from Digistore24's "Go to advertising media"` };
    }
    return { url: `https://www.digistore24.com/redir/${redir[1]}/` };
  }
  return null;
}

// Query parameters that carry an affiliate id or a per-affiliate tracking id.
const AFFILIATE_PARAMS = [
  "aff", "affiliate", "affid", "aff_id", "affiliate_id", "a_aid", "campid", "customid", "tid",
  "cam", "sid1", "sid2", "sid3", "sid4", "sid5", "ref", "refid",
];

/** A redirect hop with every affiliate parameter and the fragment removed. */
function stripAffiliate(u) {
  const url = new URL(u);
  url.hash = "";
  if (url.protocol === "http:") url.protocol = "https:";
  for (const key of [...url.searchParams.keys()]) {
    const k = key.toLowerCase();
    // ClickBank's hop=0 is how a vendor page is told "no affiliate"; any other
    // hop value is an affiliate's nickname.
    if (AFFILIATE_PARAMS.includes(k) || (k === "hop" && url.searchParams.get(key) !== "0")) {
      url.searchParams.delete(key);
    }
  }
  return url.href;
}

/** True when one of the user's affiliate ids appears anywhere in the address. */
export function carriesAffiliateId(url, ids = []) {
  let text = String(url || "").toLowerCase();
  try {
    text = decodeURIComponent(text);
  } catch {
    // keep the raw text
  }
  return ids.some((id) => id && text.includes(String(id).toLowerCase()));
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
// A picture the page itself labels as the product -- "2 bottles", "frtImg".
const PRODUCT_SHOT = "product shot on the page";

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
    const shot = LOOKS_LIKE_PRODUCT.test(said);
    const score = named * 2 + (shot ? 2 : 0);
    if (score > 0) scored.push({ url: src, via: shot ? PRODUCT_SHOT : "product photo on the page", score, order });
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

/**
 * GET a page, following redirects by hand so every hop passes the same checks.
 * `viaNetwork` is set when the start is a network link rebuilt without an
 * affiliate: then network hops are allowed and queries are kept (the vendor's
 * /go needs its hopId), minus affiliate parameters. Otherwise a redirect into a
 * network is refused and every hop is cut to origin + path.
 */
async function fetchPage(fetchFn, startUrl, { ownHost, ids, viaNetwork }) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (carriesAffiliateId(url, ids)) return { error: "refused -- the address still had your affiliate ID in it" };
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
      const intoNetwork = ["clickbank", "digistore24"].includes(detectNetwork(new URL(next).hostname.toLowerCase()));
      const reason = viaNetwork && intoNetwork ? null : unsafePageReason(next, ownHost);
      if (reason) return { error: `the page redirected to ${reason}` };
      url = viaNetwork ? stripAffiliate(next) : cleanPageUrl(next);
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
 * @param {{ fetch?: typeof fetch, ownHost?: string, productName?: string, networkHint?: string, affiliateIds?: string[] }} [opts]
 *        productName picks the product shot on pages that name no sharing
 *        picture. networkHint is the product's category. affiliateIds are
 *        the user's own ids: no address containing one is ever requested.
 * @returns {Promise<{ image_url: string, found_via: string, page: string } | { error: string, page?: string }>}
 */
export async function findVendorImage(pageUrl, opts = {}) {
  const fetchFn = opts.fetch || fetch;
  // Short strings would match inside ordinary words.
  const ids = (opts.affiliateIds || []).map((id) => String(id || "").trim()).filter((id) => id.length >= 4);

  const free = affiliateFreeStart(pageUrl, opts.networkHint);
  if (free && "error" in free) return { error: `Not opened: ${free.error}.` };
  let page;
  if (free) {
    page = free.url;
  } else {
    const reason = unsafePageReason(pageUrl, opts.ownHost);
    if (reason) return { error: `Not opened: ${reason}.` };
    page = cleanPageUrl(pageUrl);
  }
  if (carriesAffiliateId(page, ids)) {
    return { error: "Not opened: your affiliate ID is inside the address itself, so opening it would count as a click. Needs the vendor's own sales page address." };
  }

  let got;
  try {
    got = await fetchPage(fetchFn, page, { ownHost: opts.ownHost, ids, viaNetwork: !!free });
  } catch (error) {
    return { error: error?.name === "AbortError" ? "the page took too long to answer" : "the page couldn't be reached", page };
  }
  if (got.error) return { error: got.error, page };

  const shared = extractImageCandidates(got.html, got.finalUrl);
  const photos = extractProductPhotos(got.html, got.finalUrl, opts.productName).filter((p) => !shared.some((s) => s.url === p.url));
  // A labelled product shot beats the sharing picture: on video sales pages
  // og:image is often the video's thumbnail, play button and all (HepatoBurn).
  const shots = photos.filter((p) => p.via === PRODUCT_SHOT);
  const others = photos.filter((p) => p.via !== PRODUCT_SHOT);
  const candidates = [...shots.slice(0, 2), ...shared.slice(0, 3), ...others.slice(0, 2)];
  if (!candidates.length) return { error: "the page has no picture that looks like the product", page };

  for (const c of candidates) {
    if (carriesAffiliateId(c.url, ids)) continue;
    if (await isUsableImage(fetchFn, c.url)) {
      return { image_url: c.url, found_via: c.via, page: got.finalUrl };
    }
  }
  return { error: "the pictures the page names didn't load, or were too small to use", page };
}
