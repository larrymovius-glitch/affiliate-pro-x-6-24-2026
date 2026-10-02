// Catalog of affiliate networks the app knows about, beyond the three that
// have real link-building support (ClickBank, Digistore24, eBay -- see
// api/_lib/affiliates.js). This list is deliberately broad: it's what lets
// Maya/Atlas tell a user whether a trending product they found is sold
// through a network the user could actually join, not just ClickBank.
//
// Adding a network here does NOT give it automatic link-rewriting. Most of
// these hand the user a URL that already has their tag baked in once they
// generate it from that network's own dashboard -- the existing
// create_product / "add a product" flow already takes a raw destination URL,
// so that's how a user turns a new network into a tracked link.
//
// Lives in api/, like affiliates.js and tables.js, so the serverless bundler
// never has to trace an import out of this directory. src/lib/
// affiliateNetworks.js re-exports this for the frontend.
export const AFFILIATE_NETWORKS = [
  // Already integrated -- ClickBank and eBay have real link-building support
  // (api/_lib/affiliates.js, api/syncEbayTrending.js); Digistore24 too, but
  // with a single house ID and no per-user override yet.
  // Home pages, not the raw /signup path -- both networks put Login and
  // Sign Up side by side in their header, and a user who already has an
  // account needs the former, not a straight shot to account creation.
  { id: "clickbank", name: "ClickBank", category: "digital", idLabel: "ClickBank Nickname", signupUrl: "https://www.clickbank.com", instant: true },
  { id: "digistore24", name: "Digistore24", category: "digital", idLabel: "Digistore24 ID", signupUrl: "https://www.digistore24.com", instant: true },
  // eBay skips its partnernetwork.ebay.com info site and goes straight to the
  // partner dashboard, whose login page has both "Sign in with eBay" and
  // "Sign up now" -- same Login + Sign Up pairing, one less click.
  { id: "ebay", name: "eBay Partner Network", category: "retail", idLabel: "Campaign ID", signupUrl: "https://partner.ebay.com/", instant: true },

  // Digital products / courses / info-products -- same territory as ClickBank/Digistore24
  { id: "jvzoo", name: "JVZoo", category: "digital", idLabel: "JVZoo ID", signupUrl: "https://www.jvzoo.com", instant: true },
  { id: "warriorplus", name: "WarriorPlus", category: "digital", idLabel: "WarriorPlus ID", signupUrl: "https://warriorplus.com", instant: true },
  { id: "paykickstart", name: "PayKickstart", category: "digital", idLabel: "Affiliate ID", signupUrl: "https://paykickstart.com", instant: false },

  // Big retail / marketplace
  { id: "amazon", name: "Amazon Associates", category: "retail", idLabel: "Associate Tag", signupUrl: "https://affiliate-program.amazon.com", instant: false },
  { id: "walmart", name: "Walmart Affiliates", category: "retail", idLabel: "Publisher ID", signupUrl: "https://affiliates.walmart.com", instant: false },
  { id: "target", name: "Target (via Impact)", category: "retail", idLabel: "Impact Account", signupUrl: "https://partners.target.com", instant: false },
  { id: "etsy", name: "Etsy (via Awin)", category: "retail", idLabel: "Awin Publisher ID", signupUrl: "https://www.awin.com", instant: false },
  { id: "bestbuy", name: "Best Buy (via Impact)", category: "retail", idLabel: "Impact Account", signupUrl: "https://impact.com", instant: false },

  // General-purpose CPA / affiliate networks -- these carry thousands of
  // individual merchants each, so a "no direct match" trending product is
  // often still reachable through one of these.
  { id: "shareasale", name: "ShareASale", category: "general", idLabel: "Affiliate ID", signupUrl: "https://www.shareasale.com/info/", instant: false },
  { id: "cj", name: "CJ Affiliate", category: "general", idLabel: "CJ Publisher ID", signupUrl: "https://www.cj.com", instant: false },
  { id: "rakuten", name: "Rakuten Advertising", category: "general", idLabel: "Publisher ID", signupUrl: "https://rakutenadvertising.com", instant: false },
  { id: "impact", name: "Impact", category: "general", idLabel: "Impact Account", signupUrl: "https://impact.com", instant: false },
  { id: "awin", name: "Awin", category: "general", idLabel: "Awin Publisher ID", signupUrl: "https://www.awin.com", instant: false },
  { id: "flexoffers", name: "FlexOffers", category: "general", idLabel: "Affiliate ID", signupUrl: "https://www.flexoffers.com", instant: true },
  { id: "avantlink", name: "AvantLink", category: "general", idLabel: "Affiliate ID", signupUrl: "https://www.avantlink.com", instant: false },
  { id: "admitad", name: "Admitad", category: "general", idLabel: "Publisher ID", signupUrl: "https://www.admitad.com", instant: false },
  { id: "sovrn", name: "Sovrn Commerce", category: "general", idLabel: "Site ID", signupUrl: "https://www.sovrn.com/commerce", instant: true },
];

export const NETWORK_CATEGORIES = [
  { id: "digital", label: "Digital Products & Courses" },
  { id: "retail", label: "Retail & Marketplace" },
  { id: "general", label: "General-Purpose Networks" },
];

const BY_ID = new Map(AFFILIATE_NETWORKS.map((n) => [n.id, n]));

export function networkById(id) {
  return BY_ID.get(id) || null;
}

/**
 * Which of these networks does the user already have an id saved for.
 * `clickbank_nickname` predates `affiliate_network_ids` and lives in its own
 * column, so it's folded in here rather than duplicated into the jsonb blob.
 */
export function connectedNetworkIds(user) {
  const ids = new Set(Object.keys(user?.affiliate_network_ids || {}));
  if (user?.clickbank_nickname?.trim()) ids.add("clickbank");
  return ids;
}
