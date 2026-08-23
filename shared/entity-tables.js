// Single source of truth for the entity-name -> Postgres-table mapping.
//
// Both halves of the app need it: the Vercel functions in `api/` (via
// `api/_lib/tables.js`) and the browser client (`src/api/base44Client.js`).
// It used to be copy-pasted into both, which is how `Payment` and
// `Subscription` ended up missing from the frontend copy. Add new entities
// here and nowhere else.
export const ENTITY_TABLES = {
  AdAsset: "ad_assets",
  AdReview: "ad_reviews",
  AffiliateLink: "affiliate_links",
  AssistantAvatar: "assistant_avatars",
  Campaign: "campaigns",
  ClickEvent: "click_events",
  ConversionEvent: "conversion_events",
  EbayToken: "ebay_tokens",
  GeneratedPost: "generated_posts",
  GoogleReviewer: "google_reviewers",
  Notification: "notifications",
  Payment: "payments",
  Payout: "payouts",
  PayoutSchedule: "payout_schedules",
  ProAutomationRule: "pro_automation_rules",
  Product: "products",
  Subscription: "subscriptions",
  User: "profiles",
};

export default ENTITY_TABLES;
