// Entity name -> Postgres table name. Single source of truth for both halves
// of the app: the Vercel functions here in `api/`, and the browser client
// (`src/api/base44Client.js`), which imports this same object. It used to be
// copy-pasted into both, which is how `Payment` and `Subscription` ended up
// missing from the frontend copy. Add new entities here and nowhere else.
//
// Deliberately dependency-free and kept inside `api/` so the serverless
// bundler never has to trace an import out of this directory. Vite inlines it
// into the browser bundle at build time.
export const TABLES = {
  AdAsset: "ad_assets",
  AdReview: "ad_reviews",
  AffiliateLink: "affiliate_links",
  AssistantAvatar: "assistant_avatars",
  Campaign: "campaigns",
  ClickEvent: "click_events",
  ConversionEvent: "conversion_events",
  CreativeImport: "creative_imports",
  EbayToken: "ebay_tokens",
  GeneratedPost: "generated_posts",
  GoogleReviewer: "google_reviewers",
  Notification: "notifications",
  Payment: "payments",
  Payout: "payouts",
  PayoutSchedule: "payout_schedules",
  ProAutomationRule: "pro_automation_rules",
  Product: "products",
  SignupAttempt: "signup_attempts",
  Subscription: "subscriptions",
  User: "profiles",
  VendorApplication: "vendor_applications",
  VeteranVerificationDocument: "veteran_verification_documents",
};
