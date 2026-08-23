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
//   anything else ?subid=<code>                    common convention -- CONFIRM
//                                                  against your network's docs
//                                                  before trusting it.
//
// Sources: ClickBank "Affiliate Tracking Parameters"; Digistore24 "Track
// advertising campaigns with tracking and campaign key".

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

function isClickBank(host, network) {
  return network === "clickbank" || hostMatches(host, "hop.clickbank.net");
}

function isDigistore(host, network) {
  return (
    network === "digistore24" ||
    hostMatches(host, "digistore24.com") ||
    hostMatches(host, "checkout-ds24.com")
  );
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

  const host = url.hostname.toLowerCase();
  const net = String(network || "").toLowerCase();

  if (isClickBank(host, net)) {
    url.searchParams.set("tid", normalizeTrackingCode(shortCode).slice(0, 50));
  } else if (isDigistore(host, net)) {
    const code = normalizeTrackingCode(shortCode);
    if (!setDigistoreCampaignKey(url, code)) url.searchParams.set("sid1", code);
    else url.searchParams.set("sid1", code);
  } else {
    url.searchParams.set("subid", shortCode);
  }

  return url.toString();
}
