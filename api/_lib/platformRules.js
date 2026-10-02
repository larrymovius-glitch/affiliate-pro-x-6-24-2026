// What TikTok allows an affiliate to post about a product.
//
// TikTok treats any post that earns a commission through an affiliate link as
// Branded Content, and its Branded Content Policy
// (https://www.tiktok.com/legal/page/global/bc-policy/en, read 2026-09-26)
// sorts products three ways:
//   - banned outright: weight-loss and weight-management supplements (fat
//     burners, appetite suppressants, detox teas) and get-rich-quick or
//     too-good-to-be-true financial offers;
//   - restricted: vitamin and food supplements that claim health benefits --
//     adults only, in the market where posted;
//   - everything else, which still needs the commercial content disclosure
//     toggle switched on.
//
// This is a keyword check over what the app knows about a product, so it errs
// toward caution: a false "banned" costs one ad, a missed one can cost the
// account. eBay listings are ordinary merchandise and skip the keyword checks
// -- "slim fit" jeans are not a diet pill.

export const TIKTOK_POLICY_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

// Some vendors require this on supplement ads (Advanced Bionutritionals does),
// and it is the standard line for any dietary supplement claim in the US.
export const FDA_DISCLAIMER =
  "These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.";

// Word starts (\b...) rather than bare substrings where a short word would
// catch innocent names; "burn\b" is left open at the front so it catches
// compound names like HepatoBurn.
const WEIGHT_LOSS =
  /weight[\s-]*(loss|management|control)|lose weight|fat[\s-]*(burn|loss|melt)|\bslim|\bbelly\b|burn\b|\blipo|\bketo\b|appetite|\bdetox|\bdiet\s+(pill|tea|drink|supplement)|metaboli[cs]|hydrolean/i;

const GET_RICH =
  /\bwealth|\bincome\b|\bprofits?\b|make money|making money|get rich|passive income|\bcash\s+(system|machine|flow)|millionaire|side hustle/i;

const SUPPLEMENT =
  /supplement|\bformula\b|capsule|probiotic|vitamin|gumm(y|ies)|\bbottles?\b|\btonic\b|\bpills?\b|\bamino\b|nutrition|prodentim|nervovive|prostavive|audifort|gluco/i;

/**
 * @param {{ name?: string, description?: string, category?: string }} product
 * @param {{ isEbay?: boolean }} [opts]
 * @returns {{ status: "banned"|"restricted"|"allowed", reason: string }}
 */
export function tiktokRule(product, { isEbay = false } = {}) {
  if (isEbay) {
    return { status: "allowed", reason: "Ordinary merchandise from eBay." };
  }
  const text = `${product?.name || ""} ${product?.description || ""}`;
  if (WEIGHT_LOSS.test(text)) {
    return {
      status: "banned",
      reason: "TikTok bans affiliate posts for weight-loss and weight-management products, including anything that implies weight loss.",
    };
  }
  if (GET_RICH.test(text)) {
    return {
      status: "banned",
      reason: "TikTok bans affiliate posts for get-rich-quick and make-money offers.",
    };
  }
  if (SUPPLEMENT.test(text)) {
    return {
      status: "restricted",
      reason: "TikTok restricts supplement posts to adults, and the wording must stay mild: no health, disease or weight claims.",
    };
  }
  return { status: "allowed", reason: "Not in a category TikTok bans or restricts." };
}

// What each value of products.creative_rule allows as the picture or footage
// behind an ad. Many ClickBank and Digistore24 vendors allow only the
// creatives they hand out, and most forbid anything taken from their sales
// page or sales video -- which is exactly what a picture found on the sales
// page is. products.image_source records where the saved picture came from; a
// database trigger clears it whenever the picture changes.
const IMAGE_OK = {
  any: ["official", "own", "sales_page", null],
  own_or_official: ["official", "own"],
  official_only: ["official"],
};

/**
 * Whether an ad may be built for this product with this picture or footage,
 * under the vendor's own creative rules.
 *
 * @param {{ name?: string, creative_rule?: string|null, creative_rule_note?: string|null, creative_rule_source?: string|null, image_source?: string|null }} product
 * @param {{ isEbay?: boolean, footage?: boolean, footageIsOfficial?: boolean }} [opts]
 * @returns {{ ok: true, note: string|null } | { ok: false, reason: string, note: string|null, source: string|null }}
 */
export function vendorCreativeCheck(product, { isEbay = false, footage = false, footageIsOfficial = false } = {}) {
  // eBay listings carry their own photos through eBay's API, and eBay
  // publishes no vendor-style creative rules for them.
  if (isEbay) return { ok: true, note: null };

  const name = product?.name || "This product";
  const rule = product?.creative_rule || null;
  const note = product?.creative_rule_note || null;
  const source = product?.creative_rule_source || null;
  const refuse = (reason) => ({ ok: false, reason, note, source });

  if (!rule) {
    return refuse(`${name}'s vendor rules on which pictures and videos affiliates may use haven't been checked yet, and many vendors allow only their own creatives. No ad until they are.`);
  }
  if (rule === "unaltered") {
    return refuse(`${name}'s vendor requires its own ads to be posted exactly as supplied, so no AI ad can be made. Post the vendor's creative unedited instead.`);
  }
  if (footage) {
    if (rule === "official_only" && !footageIsOfficial) {
      return refuse(`${name}'s vendor allows only its official creatives. Use a clip from the vendor's own creatives kit, and only once the owner has said it came from there.`);
    }
    return { ok: true, note };
  }
  const allowed = IMAGE_OK[rule] || [];
  if (!allowed.includes(product?.image_source ?? null)) {
    const from =
      product?.image_source === "sales_page" ? "came from the vendor's sales page" : "has no confirmed source";
    const needs = rule === "official_only" ? "one of the vendor's official creatives" : "a picture from the vendor's affiliate kit or one the owner made";
    return refuse(`${name}'s saved picture ${from}, and its vendor allows only ${needs}. Use the owner's own footage instead, or save a picture that qualifies.`);
  }
  return { ok: true, note };
}

/** What to switch on in TikTok when posting an ad with this rule. */
export function tiktokPostingChecklist(rule) {
  const steps = [
    "Turn on Content disclosure and choose Branded content (required for any post with an affiliate link).",
    "Turn on the AI-generated content label.",
    "Put your share page link in your bio.",
  ];
  if (rule?.status === "restricted") {
    steps.push("Set Audience controls to adults only (18+).");
  }
  return steps;
}
