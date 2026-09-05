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
 * Handles `hop.clickbank.net/?affiliate=` and the classic
 * `<affiliate>.<vendor>.hop.clickbank.net`. Anything that is not a ClickBank
 * URL, or not a URL at all, is returned untouched -- as is an *encrypted*
 * hoplink, for the reason below.
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
      // ClickBank has two hoplink shapes and only one of them can be rewritten:
      //
      //   classic    <affiliate>.<vendor>.hop.clickbank.net   5 labels
      //   encrypted  <token>.hop.clickbank.net                4 labels
      //
      // The encrypted token encodes the affiliate AND the vendor together, and
      // ClickBank's own guidance is that it cannot be edited -- that is the
      // point of it. Blindly overwriting label 0 turned
      // `2932f2ztddoo-91gljhlinczeq.hop.clickbank.net` into
      // `apxalaska.hop.clickbank.net`: the vendor gone, the link pointing at no
      // product at all, and every click on it worth exactly nothing. Encrypted
      // links already carry their affiliate, so the right move is to leave them
      // alone rather than destroy them.
      if (parts.length < 5) return value;
      parts[0] = affiliateId;
      url.hostname = parts.join(".");
      return url.toString();
    }
  } catch (_) {
    return value;
  }
  return value;
}
