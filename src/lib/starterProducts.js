// A short list for people with no products yet, so "pick a product" has
// something to pick. ClickBank only: its links are built from the member's own
// nickname plus the vendor's, with no per-product paperwork in the app.
//
// Left out on purpose: weight-loss offers, which TikTok bans for affiliates,
// and wealth or get-rich offers, which TikTok bans and which don't fit who this
// app is for. Each vendor here is one the owner's account already promotes.
export const STARTER_PRODUCTS = [
  { vendor: "brainsongx", name: "The Brain Song" },
  { vendor: "yusleep", name: "YU Sleep" },
  { vendor: "enrev", name: "Energy Revolution System" },
  { vendor: "audifort", name: "Audifort" },
  { vendor: "femicore", name: "FemiCore" },
];

export function starterHopLink(affiliateId, vendor) {
  return `https://${affiliateId}.${vendor}.hop.clickbank.net`;
}

export function starterShortCode(vendor, links = []) {
  const taken = new Set(links.map((l) => l.short_code));
  const base = `cb_${vendor}`;
  let code = base;
  for (let i = 2; taken.has(code); i += 1) code = `${base}_${i}`;
  return code;
}
