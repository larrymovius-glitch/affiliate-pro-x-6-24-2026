// Injects our short_code into an outbound affiliate URL as the network's
// tracking id, so the network can tell us -- on its postback to
// /api/trackConversion -- which link produced the sale.
//
// Without this the postback arrives with no code to match, trackConversion
// takes its "unknown code" branch and returns 200, and the sale is silently
// dropped: clicks keep counting while earnings stay at $0.
//
// The parameter is network-specific and the shapes are NOT interchangeable:
//
//   ClickBank    ?tid=<code>                       query param. Alphanumeric,
//                                                  up to 50 chars.
//   Digistore24  /redir/<product>/<aff>/<code>     the campaign key is a PATH
//                                                  segment, not a query param.
//                                                  sid1 is also set, since S2S
//                                                  postbacks can return either.
//                vendor page ?cam=<code>           a vendor's own page (with
//                                                  #aff=) has no path slot, so
//                                                  the key goes in as cam.
//   eBay (EPN)   ?customid=<code>                  EPN's own per-link field. The
//                                                  Browse API hands back links
//                                                  with it present but empty.
//   Impact       ?subId1=<code>                    Impact's own sub-id field,
//                                                  reported back per action.
//   anything else ?subid=<code>                    common convention -- CONFIRM
//                                                  against your network's docs
//                                                  before trusting it.
//
// Which row applies is decided by the destination's HOST, not the link's
// stored `network`. See detectNetwork below for why.
//
// Sources: ClickBank "Affiliate Tracking Parameters"; Digistore24 "Track
// advertising campaigns with tracking and campaign key"; eBay Partner Network
// "Custom ID".

// The network reports the tracking id back to us as free text, and some
// networks strip punctuation. Compare codes through this on both sides so a
// stored "cb_vendor" still matches a returned "cbvendor".
export function normalizeTrackingCode(code) {
  return String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Match the domain itself or a subdomain of it -- never a bare suffix.
// `host.endsWith("digistore24.com")` would also accept "eviIdigistore24.com",
// which is a different registrable domain owned by someone else.
function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

// eBay marketplaces an EPN link can point at. Listed rather than matched with
// a pattern, because /(^|\.)ebay\./ would also accept "ebay.evil.com".
const EBAY_DOMAINS = [
  "ebay.com", "ebay.co.uk", "ebay.ca", "ebay.com.au", "ebay.de", "ebay.fr",
  "ebay.it", "ebay.es", "ebay.ie", "ebay.at", "ebay.ch", "ebay.nl", "ebay.be", "ebay.pl",
];

// Impact's tracking domains. A brand on Impact either uses one of these
// (shopify.pxf.io, *.sjv.io, ...) or a "goto." vanity host of its own, like
// goto.samsclub.com and goto.walmart.com.
const IMPACT_DOMAINS = ["sjv.io", "pxf.io", "evyy.net", "7eer.net", "ojrq.net", "mvq.net", "vrm8.net", "ugdi.net", "uzbm.net"];

function isImpactHost(h) {
  return IMPACT_DOMAINS.some((d) => hostMatches(h, d)) || /^goto\.[a-z0-9-]+\.[a-z.]+$/.test(h) || /(^|\.)i\d{5,}\.net$/.test(h);
}

/**
 * Which network's tracking rules apply to a destination.
 *
 * The host decides whenever it is one we recognise; the stored label only
 * breaks the tie for hosts we don't (a vendor's own sales page, a ClickBank
 * direct-tracking link). That order matters because the label is unreliable:
 * affiliate_links.network defaults to 'clickbank' in the database, and most
 * code paths that create links never set it. Trusting the label first sent
 * Digistore24 promolinks out with a ClickBank `tid` and an empty campaign key,
 * so Digistore24 could never report their sales back, and sent eBay links out
 * with a `tid` eBay ignores.
 *
 * @param {string} host lowercased hostname of the destination
 * @param {string} [label] the link's stored network, if any
 * @returns {string} "clickbank" | "digistore24" | "ebay" | "impact" | the label | ""
 */
export function detectNetwork(host, label) {
  const h = String(host || "").toLowerCase();
  if (hostMatches(h, "hop.clickbank.net")) return "clickbank";
  if (hostMatches(h, "digistore24.com") || hostMatches(h, "checkout-ds24.com")) return "digistore24";
  if (EBAY_DOMAINS.some((d) => hostMatches(h, d))) return "ebay";
  if (isImpactHost(h)) return "impact";
  return String(label || "").toLowerCase();
}

// The networks this file has specific tracking rules for.
const KNOWN_NETWORKS = ["clickbank", "digistore24", "ebay", "impact"];

/**
 * The `network` to store on a new AffiliateLink, or null when nothing proves
 * one. Every code path that creates a link should set it through this: left
 * unset, the column's 'clickbank' default labels eBay and Warrior Plus links
 * ClickBank, and a host we don't recognise then goes out with ClickBank's tid
 * instead of the generic subid its postback expects.
 *
 * `hint` is what the app already knows about the product -- the category that
 * the ClickBank, Digistore24 and trending flows stamp on products they create
 * ("digistore24", "clickbank_trending", ...). That is how a Digistore24
 * vendor's own sales page, whose host proves nothing, still gets Digistore24's
 * rules. Any other category, such as a niche like "Health & Fitness", says
 * nothing about the network and is ignored.
 *
 * @param {string} destinationUrl
 * @param {string} [hint] the product's category, if any
 * @returns {string | null}
 */
export function networkForDestination(destinationUrl, hint) {
  let host = "";
  try {
    host = new URL(destinationUrl).hostname;
  } catch {
    // not a URL: only the hint can say anything
  }
  const h = String(hint || "").toLowerCase().replace(/_trending$/, "");
  return detectNetwork(host, KNOWN_NETWORKS.includes(h) ? h : "") || null;
}

// Digistore24 promolinks look like /redir/<productId>/<affiliate>/<campaignKey>.
// The app builds them with an empty campaign-key slot, which is exactly where
// the short code belongs.
function setDigistoreCampaignKey(url, code) {
  const parts = url.pathname.split("/");
  const redirAt = parts.indexOf("redir");
  if (redirAt === -1) return false;
  const keyAt = redirAt + 3;
  if (parts.length > keyAt) parts[keyAt] = code;
  else if (parts.length === keyAt) parts.push(code);
  else return false;
  url.pathname = parts.join("/");
  return true;
}

/**
 * @param {string} destinationUrl the link's raw destination
 * @param {string} shortCode the AffiliateLink short_code to attribute to
 * @param {string} [network] optional AffiliateLink.network hint
 * @returns {string} the destination with a tracking id applied
 */
export function applyTrackingCode(destinationUrl, shortCode, network) {
  if (!destinationUrl || !shortCode) return destinationUrl;

  let url;
  try {
    url = new URL(destinationUrl);
  } catch {
    return destinationUrl; // not parseable: redirect untouched rather than break the click
  }

  const net = detectNetwork(url.hostname, network);

  if (net === "clickbank") {
    url.searchParams.set("tid", normalizeTrackingCode(shortCode).slice(0, 50));
  } else if (net === "digistore24") {
    const code = normalizeTrackingCode(shortCode);
    // A promolink carries the campaign key in its path. A link to a vendor's
    // own page has no such slot, so hand the code over as `cam` -- the
    // Digistore24 script on that page reads cam alongside aff and carries both
    // to checkout, which is what makes {campaignkey} come back on the sale.
    if (!setDigistoreCampaignKey(url, code)) url.searchParams.set("cam", code);
    url.searchParams.set("sid1", code);
  } else if (net === "ebay") {
    url.searchParams.set("customid", normalizeTrackingCode(shortCode).slice(0, 256));
  } else if (net === "impact") {
    url.searchParams.set("subId1", shortCode);
  } else {
    url.searchParams.set("subid", shortCode);
  }

  return url.toString();
}
