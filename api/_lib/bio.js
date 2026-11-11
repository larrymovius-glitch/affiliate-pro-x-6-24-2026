// The public share page -- one address that holds every link someone is
// currently promoting, for the places that allow exactly one clickable link.
//
// TikTok is the reason this exists: it gives a profile one link and no
// clickable links inside posts, so a 3k-follower account has a single doorway
// for all of its traffic. Instagram, YouTube and X work the same way.
//
// Rendered here as plain HTML from a serverless function rather than as a
// route in the React app, because of where it gets opened: inside TikTok's and
// Instagram's in-app browsers, on phone data, by someone who will leave if it
// is blank for a second. So it ships as one HTML response with inline styles,
// no scripts, no fonts and no framework -- nothing to load before the buttons
// are on screen and tappable.
//
// Every button points at /r/<short_code>, never at the affiliate destination,
// so a tap is counted (and robots are not -- see api/_lib/bots.js) and the
// network's tracking id is attached on the way out.

/**
 * A handle is part of a public URL, so it cannot carry anything that changes
 * how that URL parses. Lowercased on the way in, which is also why the unique
 * index is on lower(bio_handle): "Larry" and "larry" must not be two people.
 *
 * @returns {string} the cleaned handle, or "" if nothing usable is left
 */
export function normalizeHandle(value) {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : "";
}

/**
 * Everything interpolated below is user-supplied -- product names come from
 * whatever was typed into the Links page, and this page is public. Escapes
 * quotes too, since some of it lands in attributes.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Product images are pasted in by hand, so an image URL could be anything,
// including a javascript: URL. Only http(s) is ever rendered.
function safeImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "•";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// Required by the FTC when a link can earn a commission (16 CFR Part 255), and
// by ClickBank, Digistore24 and eBay Partner Network in their own terms. It is
// rendered above the links, not buried in the footer, because the rule is that
// it has to be seen before the click, not after.
export const DISCLOSURE =
  "Some links below are affiliate links. If you buy through one of them, I may earn a commission at no extra cost to you.";

/**
 * A short "where this goes" label under each product, so a visitor knows
 * before tapping whether they are headed to eBay or a brand's own site. Only
 * the label leaves the server -- never the destination itself.
 */
export function storeLabel(destinationUrl) {
  let host = "";
  try {
    host = new URL(String(destinationUrl || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (/(^|\.)ebay\.[a-z.]+$/.test(host)) return "eBay";
  if (/(^|\.)shopify\.com$/.test(host)) return "Shopify";
  return "Official site";
}

// The button says what a tap does and where it lands.
function goLabel(store) {
  if (store === "Official site") return "Visit official site";
  return store ? `See it on ${store}` : "See it";
}

// The look: a small shop window rather than a list of buttons. Pictures do the
// selling on a phone, so each pick is a square photo tile, two across, and the
// most recently starred one runs full width at the top. System typefaces only
// (a serif stack for the name), because a web font would be a second request
// before anything paints.
const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:light dark;--bg:#f6f1f4;--card:#fff;--fg:#23131f;--muted:#6f5d69;--line:#e6dae1;--accent:#a50f4d;--on-accent:#fff;--tint:#f3dfe8;--serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
@media(prefers-color-scheme:dark){:root{--bg:#150d13;--card:#21151d;--fg:#f6eef3;--muted:#b49fae;--line:#36252f;--accent:#ff8ab5;--on-accent:#23131f;--tint:#3a1c2b}}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.45;-webkit-font-smoothing:antialiased;min-height:100vh}
.wrap{max-width:560px;margin:0 auto;padding:28px 14px 48px}
header{display:flex;align-items:center;gap:14px;margin-bottom:16px}
header.plain{display:block;text-align:center;padding-top:40px}
.avatar{width:68px;height:68px;border-radius:50%;flex:none;object-fit:cover;display:block;background:var(--accent);color:var(--on-accent);font-family:var(--serif);font-size:26px;font-weight:700;line-height:68px;text-align:center}
h1{font-family:var(--serif);font-size:27px;font-weight:700;line-height:1.15;letter-spacing:-.01em;overflow-wrap:anywhere}
.sub{color:var(--muted);font-size:15px;margin-top:3px}
.disclosure{border-left:3px solid var(--accent);padding:2px 0 2px 11px;color:var(--muted);font-size:12.5px;margin-bottom:18px}
ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:12px}
li{display:flex;min-width:0}
a.link{display:flex;flex-direction:column;flex:1;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;text-decoration:none;color:var(--fg)}
a.link:active{transform:scale(.985)}
a.link:hover{border-color:var(--accent)}
a.link:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.thumb{display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:contain;background:#fff;border-bottom:1px solid var(--line)}
.thumb.blank{display:flex;align-items:center;justify-content:center;background:var(--tint);color:var(--accent);font-family:var(--serif);font-size:64px;font-weight:700}
.info{display:flex;flex-direction:column;flex:1;padding:10px 12px 0}
.name{font-size:14.5px;font-weight:650;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.store{display:block;color:var(--muted);font-size:12.5px;margin-top:4px}
.go{display:block;margin:12px;background:var(--accent);color:var(--on-accent);font-size:13px;font-weight:700;border-radius:999px;padding:9px 6px;text-align:center}
li.first{grid-column:1/-1}
li.first a.link{flex-direction:row;align-items:stretch}
li.first .thumb{width:46%;flex:none;border-bottom:0;border-right:1px solid var(--line)}
li.first .side{display:flex;flex-direction:column;flex:1;min-width:0}
li.first .info{padding-top:14px}
li.first .name{font-family:var(--serif);font-size:19px;font-weight:700;line-height:1.2;-webkit-line-clamp:4}
.new{align-self:flex-start;background:var(--tint);color:var(--accent);font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;margin-bottom:7px}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:28px 18px;text-align:center;color:var(--muted);font-size:15px}
footer{margin-top:28px;text-align:center;color:var(--muted);font-size:12px}
footer a{color:var(--muted)}
@media(min-width:620px){.wrap{max-width:760px}ul{grid-template-columns:repeat(3,1fr)}li.first{grid-column:span 2}}
`.trim();

function shell({ title, description, canonical, body, noindex = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">\n<link rel="canonical" href="${escapeHtml(canonical)}">` : ""}
<meta name="twitter:card" content="summary">
<style>${STYLES}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

/**
 * @param {object} input
 * @param {string} input.handle
 * @param {string} [input.displayName] profiles.full_name
 * @param {string} [input.avatarUrl] profiles.avatar_url
 * @param {string} [input.origin] e.g. https://apx.amhere4utoday.com
 * @param {Array<{short_code: string, direct_url?: string, product_name?: string, image_url?: string, store?: string}>} input.links
 *        direct_url: the program's own link, for one whose terms forbid the
 *        /r/ short link (see mustShareAsGiven in tracking.js).
 */
export function renderBioPage({ handle, displayName, avatarUrl, origin = "", links = [] }) {
  const name = String(displayName || "").trim() || `@${handle}`;
  const avatar = safeImageUrl(avatarUrl);
  const head = avatar
    ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="" width="68" height="68">`
    : `<div class="avatar" aria-hidden="true">${escapeHtml(initials(displayName || handle))}</div>`;

  // Relative hrefs: the page is served from the same origin as /r/, so the
  // links keep working on a preview deployment or a custom domain.
  const shown = links.filter((link) => link?.short_code);
  // The list arrives newest-starred first, so the first tile really is the
  // newest pick. It only gets the wide treatment when there is a grid for it
  // to stand out from.
  const featureFirst = shown.length >= 3;
  const items = shown
    .map((link, index) => {
      const image = safeImageUrl(link.image_url);
      const label = String(link.product_name || "").trim() || link.short_code;
      const direct = /^https:\/\//i.test(String(link.direct_url || "")) ? link.direct_url : "";
      const href = direct ? escapeHtml(direct) : `/r/${encodeURIComponent(link.short_code)}`;
      const store = String(link.store || "").trim();
      const first = featureFirst && index === 0;
      // The first row is on screen at once; everything below it can wait.
      const thumb = image
        ? `<img class="thumb" src="${escapeHtml(image)}" alt="" width="400" height="400"${index < 3 ? "" : ' loading="lazy"'}>`
        : `<span class="thumb blank" aria-hidden="true">${escapeHtml(label.charAt(0).toUpperCase())}</span>`;
      const info = `<span class="info">${first ? '<span class="new">Newest pick</span>' : ""}<span class="name">${escapeHtml(label)}</span>${
        store ? `<span class="store">${escapeHtml(store)}</span>` : ""
      }</span><span class="go" aria-hidden="true">${escapeHtml(goLabel(store))}</span>`;
      return `<li${first ? ' class="first"' : ""}><a class="link" href="${href}" rel="sponsored nofollow noopener">${thumb}${
        first ? `<span class="side">${info}</span>` : info
      }</a></li>`;
    })
    .join("");

  const body = `<header>${head}<div><h1>${escapeHtml(name)}</h1><p class="sub">Picks I'm sharing right now</p></div></header>
<p class="disclosure">${escapeHtml(DISCLOSURE)}</p>
${items ? `<ul>${items}</ul>` : `<p class="empty">Nothing here yet — check back soon.</p>`}
<footer><p>Powered by <a href="${escapeHtml(origin)}/" rel="noopener">Affiliate Pro X</a></p></footer>`;

  return shell({
    title: `${name} — my links`,
    description: `Links shared by ${name}. ${DISCLOSURE}`,
    canonical: origin ? `${origin}/go/${handle}` : "",
    body,
  });
}

/** Shown for a handle nobody has claimed. Deliberately not indexed. */
export function renderMissingPage(origin = "") {
  return shell({
    title: "Page not found",
    description: "This share page doesn't exist.",
    canonical: "",
    noindex: true,
    body: `<header class="plain"><h1>Page not found</h1><p class="sub">This link doesn't lead anywhere yet.</p></header>
<footer><p><a href="${escapeHtml(origin)}/" rel="noopener">Affiliate Pro X</a></p></footer>`,
  });
}
