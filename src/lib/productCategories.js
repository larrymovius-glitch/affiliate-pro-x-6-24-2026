// Fixed category list for products, loosely matching the marketplace
// categories used by the networks this app actually does business with
// (ClickBank's own marketplace taxonomy, broadened to cover retail/general
// networks too -- see src/lib/affiliateNetworks.js). Category used to be a
// bare free-text field nobody filled in, which is why the "All Categories"
// filter on /products had nothing to show: it only ever listed categories
// products already had, and none did.
export const PRODUCT_CATEGORIES = [
  "Health & Fitness",
  "Beauty & Personal Care",
  "Self-Help & Personal Development",
  "Business & Investing",
  "E-business & Marketing",
  "Software & Apps",
  "Electronics & Tech",
  "Home & Garden",
  "Fashion & Apparel",
  "Food & Cooking",
  "Parenting & Family",
  "Pets",
  "Sports & Outdoors",
  "Hobbies & Crafts",
  "Spirituality & New Age",
  "Education & Reference",
  "Travel",
  "Other",
];
