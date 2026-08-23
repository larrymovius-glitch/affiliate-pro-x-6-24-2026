import { CLICKBANK_AFFILIATE_ID } from "../../api/_lib/affiliates.js";

// Re-exported under the name the frontend already uses. The value itself lives
// in api/_lib/affiliates.js so the cron job and the UI cannot drift apart.
export const DEFAULT_CLICKBANK_AFFILIATE_ID = CLICKBANK_AFFILIATE_ID;

export function getClickBankAffiliateId(user) {
  return user?.clickbank_nickname?.trim() || DEFAULT_CLICKBANK_AFFILIATE_ID;
}

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