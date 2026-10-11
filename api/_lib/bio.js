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

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:light dark;--bg:#f6f6f8;--card:#fff;--fg:#17171c;--muted:#5d5d6b;--line:#e6e6ec;--accent:#6d28d9}
@media(prefers-color-scheme:dark){:root{--bg:#0d0d12;--card:#17171f;--fg:#f4f4f6;--muted:#a0a0ae;--line:#2a2a36;--accent:#a78bfa}}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.45;-webkit-font-smoothing:antialiased;padding:32px 16px 48px}
.wrap{max-width:520px;margin:0 auto}
header{text-align:center;margin-bottom:22px}
.avatar{width:84px;height:84px;border-radius:50%;margin:0 auto 14px;object-fit:cover;display:block;background:var(--accent);color:#fff;font-size:30px;font-weight:700;line-height:84px;text-align:center}
h1{font-size:23px;font-weight:700;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:15px;margin-top:4px}
.disclosure{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--muted);font-size:13px;margin-bottom:18px}
ul{list-style:none;display:flex;flex-direction:column;gap:12px}
a.link{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;min-height:64px;text-decoration:none;color:var(--fg);font-size:16px;font-weight:600;transition:transform .08s ease,border-color .15s ease}
a.link:active{transform:scale(.985)}
a.link:hover{border-color:var(--accent)}
.thumb{width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none;background:var(--line)}
.name{flex:1;min-width:0;overflow-wrap:anywhere}
.chev{color:var(--muted);flex:none;font-size:20px;line-height:1}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:28px 18px;text-align:center;color:var(--muted);font-size:15px}
footer{margin-top:28px;text-align:center;color:var(--muted);font-size:12px}
footer a{color:var(--muted)}
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
 * @param {Array<{short_code: string, direct_url?: string, product_name?: string, image_url?: string}>} input.links
 *        direct_url: the program's own link, for one whose terms forbid the
 *        /r/ short link (see mustShareAsGiven in tracking.js).
 */
export function renderBioPage({ handle, displayName, avatarUrl, origin = "", links = [] }) {
  const name = String(displayName || "").trim() || `@${handle}`;
  const avatar = safeImageUrl(avatarUrl);
  const head = avatar
    ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="" width="84" height="84">`
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
      return `<li><a class="link" href="${href}" rel="sponsored nofollow noopener">${
        image ? `<img class="thumb" src="${escapeHtml(image)}" alt="" width="44" height="44" loading="lazy">` : ""
      }<span class="name">${escapeHtml(label)}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
    })
    .join("");

  const body = `<header>${head}<h1>${escapeHtml(name)}</h1><p class="sub">Everything I'm sharing right now</p></header>
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
    body: `<header><h1>Page not found</h1><p class="sub">This link doesn't lead anywhere yet.</p></header>
<footer><p><a href="${escapeHtml(origin)}/" rel="noopener">Affiliate Pro X</a></p></footer>`,
  });
}
