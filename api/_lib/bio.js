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

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:light dark;--bg:#f4f3f8;--card:#fff;--fg:#15151b;--muted:#62626f;--line:#e7e5ee;--accent:#6d28d9;--accent-soft:#ede7fb;--hero:linear-gradient(160deg,#7c3aed 0%,#db2777 55%,#f59e0b 100%);--shadow:0 1px 2px rgba(20,20,40,.05),0 6px 20px rgba(20,20,40,.06)}
@media(prefers-color-scheme:dark){:root{--bg:#0c0c11;--card:#17171f;--fg:#f4f4f6;--muted:#a3a3b2;--line:#272733;--accent:#b79cff;--accent-soft:#2a2240;--hero:linear-gradient(160deg,#4c1d95 0%,#9d174d 60%,#92400e 100%);--shadow:none}}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.45;-webkit-font-smoothing:antialiased;min-height:100vh}
.hero{background:var(--hero);height:132px}
.wrap{max-width:520px;margin:32px auto 0;padding:0 16px 48px}
.hero+.wrap{margin-top:-64px}
header{text-align:center;margin-bottom:20px}
.avatar{width:104px;height:104px;border-radius:50%;margin:0 auto 12px;object-fit:cover;display:block;background:var(--accent);color:#fff;font-size:36px;font-weight:700;line-height:104px;text-align:center;border:4px solid var(--bg);box-shadow:var(--shadow)}
h1{font-size:24px;font-weight:800;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:15px;margin-top:4px}
.disclosure{display:flex;gap:8px;align-items:flex-start;background:var(--accent-soft);border-radius:12px;padding:10px 12px;color:var(--muted);font-size:12.5px;margin-bottom:18px}
.disclosure b{color:var(--accent);font-weight:700;flex:none}
ul{list-style:none;display:flex;flex-direction:column;gap:12px}
a.link{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:10px 12px 10px 10px;min-height:92px;text-decoration:none;color:var(--fg);box-shadow:var(--shadow);transition:transform .08s ease,border-color .15s ease}
a.link:active{transform:scale(.985)}
a.link:hover{border-color:var(--accent)}
.thumb{width:72px;height:72px;border-radius:12px;object-fit:contain;flex:none;background:#fff;border:1px solid var(--line)}
.thumb.blank{display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);font-size:26px;font-weight:700}
.info{flex:1;min-width:0}
.name{font-size:15.5px;font-weight:650;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.store{display:block;color:var(--muted);font-size:12.5px;margin-top:4px}
.go{flex:none;background:var(--accent);color:#fff;font-size:13px;font-weight:700;border-radius:999px;padding:8px 13px;white-space:nowrap}
@media(prefers-color-scheme:dark){.go{color:#15151b}}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:18px;padding:28px 18px;text-align:center;color:var(--muted);font-size:15px}
footer{margin-top:28px;text-align:center;color:var(--muted);font-size:12px}
footer a{color:var(--muted)}
`.trim();

function shell({ title, description, canonical, body, noindex = false, hero = false }) {
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
<body>${hero ? '<div class="hero" aria-hidden="true"></div>' : ""}<div class="wrap">${body}</div></body>
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
    ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="" width="104" height="104">`
    : `<div class="avatar" aria-hidden="true">${escapeHtml(initials(displayName || handle))}</div>`;

  // Relative hrefs: the page is served from the same origin as /r/, so the
  // links keep working on a preview deployment or a custom domain.
  const items = links
    .filter((link) => link?.short_code)
    .map((link) => {
      const image = safeImageUrl(link.image_url);
      const label = String(link.product_name || "").trim() || link.short_code;
      const direct = /^https:\/\//i.test(String(link.direct_url || "")) ? link.direct_url : "";
      const href = direct ? escapeHtml(direct) : `/r/${encodeURIComponent(link.short_code)}`;
      const store = String(link.store || "").trim();
      const thumb = image
        ? `<img class="thumb" src="${escapeHtml(image)}" alt="" width="72" height="72" loading="lazy">`
        : `<span class="thumb blank" aria-hidden="true">${escapeHtml(label.charAt(0).toUpperCase())}</span>`;
      return `<li><a class="link" href="${href}" rel="sponsored nofollow noopener">${thumb}<span class="info"><span class="name">${escapeHtml(label)}</span>${
        store ? `<span class="store">${escapeHtml(store)}</span>` : ""
      }</span><span class="go" aria-hidden="true">View ›</span></a></li>`;
    })
    .join("");

  const body = `<header>${head}<h1>${escapeHtml(name)}</h1><p class="sub">Picks I'm sharing right now</p></header>
<p class="disclosure"><b aria-hidden="true">ⓘ</b><span>${escapeHtml(DISCLOSURE)}</span></p>
${items ? `<ul>${items}</ul>` : `<p class="empty">Nothing here yet — check back soon.</p>`}
<footer><p>Powered by <a href="${escapeHtml(origin)}/" rel="noopener">Affiliate Pro X</a></p></footer>`;

  return shell({
    title: `${name} — my links`,
    description: `Links shared by ${name}. ${DISCLOSURE}`,
    canonical: origin ? `${origin}/go/${handle}` : "",
    body,
    hero: true,
  });
}

/** Shown for a handle nobody has claimed. Deliberately not indexed. */
export function renderMissingPage(origin = "") {
  return shell({
    title: "Page not found",
    description: "This share page doesn't exist.",
    canonical: "",
    noindex: true,
    body: `<header><h1>Page not found</h1><p class="sub">This link doesn't lead anywhere yet.</p></header>
<footer><p><a href="${escapeHtml(origin)}/" rel="noopener">Affiliate Pro X</a></p></footer>`,
  });
}
