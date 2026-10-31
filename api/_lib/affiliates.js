// The affiliate accounts links are built under. These are the IDs the networks
// pay against, so a wrong one credits nobody and fails silently -- no error,
// just $0 forever. `Here_4you` shipped for a while in place of `Here4_you`,
// and every Digistore link built under it was dead.
//
// Verify against the network's own dashboard before changing either of these,
// never from memory. Digistore24 shows it in the account menu as
// "Digistore24-ID"; ClickBank shows the nickname in account settings.
//
// Lives in api/ so the serverless bundler never traces an import out of this
// directory. Vite inlines it into the browser bundle at build time.

export const DIGISTORE_AFFILIATE_ID = "Here4_you";

// Per-user overridable via profiles.clickbank_nickname -- see
// src/lib/affiliate-id.js.
export const CLICKBANK_AFFILIATE_ID = "apxalaska";

// Digistore24 promolink shape: /redir/<productId>/<affiliate>/<campaignKey>.
// The campaign key is left empty here on purpose -- api/_lib/tracking.js fills
// that slot with the link's short_code at redirect time, which is what lets a
// sale be attributed back to the link that produced it.
//
// `affiliateId` defaults to the house account for callers with no specific
// user in context (the trending-sync cron). Pass getDigistoreAffiliateId(user)
// for anything a real user is building for themselves.
export function digistorePromoLink(productId, affiliateId = DIGISTORE_AFFILIATE_ID) {
  return `https://www.digistore24.com/redir/${productId}/${affiliateId}/`;
}

// Digistore24 product numbers are all digits. The trending search sometimes
// hands back a placeholder instead -- "VERIFY_IN_MARKETPLACE" was saved as a
// product once -- and a promolink built from one can never work.
export function isDigistoreProductId(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

/**
 * The user's own Digistore24 ID if they saved one on /networks
 * (profiles.affiliate_network_ids.digistore24), else the house account.
 * Mirrors getClickBankAffiliateId below -- this used to be house-only, which
 * is why saving a Digistore24 ID on /networks appeared to do nothing: nothing
 * downstream ever read it.
 */
export function getDigistoreAffiliateId(user) {
  return user?.affiliate_network_ids?.digistore24?.trim() || DIGISTORE_AFFILIATE_ID;
}

// One shape for every outcome, so callers read .url / .error without first
// narrowing a union -- which checkJs will not do for them.
const ok = (url, productId) => ({ url, productId, error: null });
const fail = (error) => ({ url: null, productId: null, error });

/**
 * Turns whatever was typed into "Add Digistore24 link" into a destination.
 *
 * This used to treat every input as a product number, so a pasted vendor link
 * got wrapped whole into digistore24.com/redir/<the entire URL>/..., which
 * Digistore24 answers with a 403. That is how the busiest link in the app
 * sent 50 clicks to an error page.
 *
 * The link has to be taken as given, because the VENDOR decides its shape and
 * Digistore24 enforces it. Checked in a real browser against products this
 * account is approved for:
 *   - many vendors refuse www.digistore24.com/redir/... outright ("Incorrect
 *     domain in the link") and require their own domain instead, e.g.
 *     digital-success.pages.dev/redir/581314/<aff>/;
 *   - some route promolinks through checkout-ds24.com;
 *   - some hand affiliates their own page carrying #aff=<id>, which
 *     Digistore24's digistore.js there reads (with cam, sid1..5) and carries
 *     to checkout.
 * And the domain Digistore24's error page suggests is not reliable either --
 * two of four tried were 404s. So nothing here rebuilds a pasted link onto a
 * different host; the source of truth is the product's "Go to advertising
 * media" link in Digistore24.
 *
 *   "571423"                          -> the standard promolink (fine for
 *                                        vendors without their own domain)
 *   <any host>/redir/<number>/<aff>/  -> used exactly as pasted
 *   a vendor page carrying aff=       -> used exactly as pasted
 *
 * Anything else is refused rather than guessed at: a link that looks fine and
 * credits nobody is worse than an error message.
 *
 * @returns {{url: string|null, productId: string|null, error: string|null}}
 */
export function parseDigistoreInput(input, affiliateId = DIGISTORE_AFFILIATE_ID) {
  const raw = String(input || "").trim();
  if (!raw) return fail("Enter a product number, or paste the product's affiliate link from Digistore24.");
  if (/^\d+$/.test(raw)) return ok(digistorePromoLink(raw, affiliateId), raw);

  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail("That isn't a product number or a link. Paste the product's link from Digistore24 → Go to advertising media.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return fail("Paste a web link starting with https://.");
  }

  // A promolink, on whichever domain the vendor chose. Kept as-is.
  const promo = url.pathname.match(/\/redir\/(\d+)\/[^/]+/);
  if (promo) return ok(raw, promo[1]);

  // Anything else on Digistore24's own domains is a malformed promolink -- the
  // wrapped-URL shape above lands here, since its "product number" is "https:".
  if (/(^|\.)(digistore24\.com|checkout-ds24\.com)$/.test(url.hostname.toLowerCase())) {
    return fail("That Digistore24 link has no product number and affiliate ID in it. Copy the link from Digistore24 → Go to advertising media.");
  }

  // A vendor's own page is only an affiliate link if it names the affiliate.
  if (!/(^|[#?&])aff=[^&]+/.test(`${url.search}&${url.hash}`)) {
    return fail("That link has no affiliate ID in it (no aff=), so a sale through it would credit nobody. Copy the link from Digistore24 → Go to advertising media.");
  }
  return ok(raw, null);
}

// The two below moved here from src/lib/affiliate-id.js so the serverless side
// can use them without importing out of api/. The frontend re-exports them
// under the names it already used, and createAutopilotPack.js no longer keeps
// its own copy -- there were two implementations of the rewrite, which is how
// an affiliate id quietly goes wrong in one place and not the other.

/** The user's own ClickBank nickname if they set one, else the house account. */
export function getClickBankAffiliateId(user) {
  return user?.clickbank_nickname?.trim() || CLICKBANK_AFFILIATE_ID;
}

/**
 * The ID a member's own links are built under, or null if they haven't saved
 * one. Never the house account: a new member's link built under it would pay
 * their sale to APX, with nothing on screen to tell them.
 */
export function ownClickBankId(user) {
  return user?.clickbank_nickname?.trim() || null;
}

export function ownDigistoreId(user) {
  return user?.affiliate_network_ids?.digistore24?.trim() || null;
}

export function isClickBankHopLink(value) {
  try {
    const { hostname } = new URL(value);
    return hostname === "hop.clickbank.net" || hostname.endsWith(".hop.clickbank.net");
  } catch (_) {
    return false;
  }
}

export const NEED_CLICKBANK_ID = "Save your own ClickBank nickname on the Networks page first, so sales are credited to you.";

/** Where a member's link for this product should point, or why it can't be made yet. */
export function destinationForUser(user, productUrl) {
  if (!isClickBankHopLink(productUrl)) return { url: productUrl, error: null };
  const id = ownClickBankId(user);
  if (!id) return { url: null, error: NEED_CLICKBANK_ID };
  return { url: applyClickBankAffiliateId(productUrl, id), error: null };
}

/**
 * Rewrite a ClickBank hoplink so the commission is credited to `affiliateId`.
 * Handles both documented shapes -- `hop.clickbank.net/?affiliate=` and
 * `<affiliate>.<vendor>.hop.clickbank.net`. Anything that is not a ClickBank
 * URL, or not a URL at all, is returned untouched.
 */
export function applyClickBankAffiliateId(value, affiliateId) {
  try {
    const url = new URL(value);
    if (url.hostname === "hop.clickbank.net") {
      url.searchParams.set("affiliate", affiliateId);
      return url.toString();
    }
    if (url.hostname.endsWith(".hop.clickbank.net")) {
      const parts = url.hostname.split(".");
      parts[0] = affiliateId;
      url.hostname = parts.join(".");
      return url.toString();
    }
  } catch (_) {
    return value;
  }
  return value;
}
