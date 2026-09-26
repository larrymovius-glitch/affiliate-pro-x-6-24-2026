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
