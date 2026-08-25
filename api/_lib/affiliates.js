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
// src/lib/affiliate-id.js. Digistore24 has no such override: every user's
// Digistore link is built under the single ID above.
export const CLICKBANK_AFFILIATE_ID = "apxalaska";

// Digistore24 promolink shape: /redir/<productId>/<affiliate>/<campaignKey>.
// The campaign key is left empty here on purpose -- api/_lib/tracking.js fills
// that slot with the link's short_code at redirect time, which is what lets a
// sale be attributed back to the link that produced it.
export function digistorePromoLink(productId) {
  return `https://www.digistore24.com/redir/${productId}/${DIGISTORE_AFFILIATE_ID}/`;
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
