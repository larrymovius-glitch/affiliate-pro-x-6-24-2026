import {
  CLICKBANK_AFFILIATE_ID,
  getClickBankAffiliateId,
  applyClickBankAffiliateId,
} from "../../api/_lib/affiliates.js";

// Re-exported under the names the frontend already uses. The implementations
// live in api/_lib/affiliates.js so the cron jobs, the assistant's tools and
// the UI cannot drift apart.
export const DEFAULT_CLICKBANK_AFFILIATE_ID = CLICKBANK_AFFILIATE_ID;
export { getClickBankAffiliateId, applyClickBankAffiliateId };
export { ownClickBankId, ownDigistoreId, destinationForUser, NEED_CLICKBANK_ID } from "../../api/_lib/affiliates.js";
