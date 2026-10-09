// Video ad scripts built only from the vendor's approved copy, led by the
// owner's own opening line.
//
// Vendors hand affiliates approved ad copy -- swipe files, ad text on the
// affiliate page -- and a claim that isn't in it is the kind of thing that
// gets an affiliate account closed. A model told "use only this copy" still
// paraphrases, and a paraphrase is a new claim. So the model never writes the
// script: it only picks sentences, by number, from the approved copy, and
// this code assembles them word for word. A script handed in from outside is
// held to the same test, sentence by sentence (policies rules 3 and 4).
//
// Three outcomes, never two (policies rule 1): a script that passes is built;
// one with a sentence not in the copy is refused; and anything missing that
// only the owner can supply -- the copy, its source, the opening line, or
// usable sentences once a supplement's claims are set aside -- comes back to
// the owner instead of being guessed.

// ~150 words a minute; the renderer caps an ad at 30 seconds.
export const MAX_SCRIPT_WORDS = 60;
export const MAX_OPENING_WORDS = 25;
export const MAX_COPY_CHARS = 20_000;
const MIN_SENTENCE_WORDS = 3;
const MAX_SENTENCE_WORDS = 40;

// Swipe-file furniture that can't be spoken in a video: links, placeholders,
// email headers and sign-offs.
const NOT_SPEAKABLE =
  /https?:\/\/|www\.|\[[^\]]*\]|\{[^}]*\}|%%|<[^>]+>|@[a-z0-9-]+\.[a-z]|^\s*(subject|subject line|from|to|p\.?s\.?|preheader)\s*[:\-]|unsubscribe|click (here|the link|below)|link below|your (affiliate )?link/i;

// A video outlives the price it would quote.
const PRICE = /[$€£]\s?\d|\b\d+(\.\d+)?\s?(dollars|usd|bucks)\b|\b\d+\s?%\s?off\b/i;

// What a supplement ad must not say, whatever the vendor's copy says: TikTok's
// Branded Content Policy (see platformRules.js) and the FDA line both turn on
// health, disease, symptom, weight and body-change claims. Errs toward
// dropping a sentence: a dropped sentence costs nothing, a claim can cost the
// account.
const SUPPLEMENT_CLAIM =
  /\b(cure[sd]?|treat(s|ed|ment)?|prevent(s|ed)?|heal(s|ed|ing)?|diseases?|diabet\w*|blood (sugar|pressure)|cholesterol|pain|inflammat\w*|anxiety|depress\w*|memory|brain fog|tinnitus|hearing|vision|eyesight|prostate|liver|kidney|immun\w*|lose|loss|losing|weight|pounds|lbs|fat|belly|slim\w*|burn\w*|metabol\w*|energy|sleep|clinically|proven|doctors?|scientists?|study|studies|research|results?|before and after|guarantee\w*|miracle|breakthrough|secret|risk[- ]free|i (lost|tried|feel)|my (doctor|husband|wife))\b/i;

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

/** Compares sentences ignoring case, spacing, curly quotes and end punctuation. */
export function normalizeSentence(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[\s.!?…"')\]]+$/g, "")
    .replace(/^[\s"'(\[\-–—•*]+/g, "")
    .trim();
}

/** Splits copy into sentences: at end punctuation and at line breaks. */
export function splitSentences(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?…])["')\]]*\s+(?=["'(\[]?[A-Z0-9])/))
    .map((s) => s.replace(/^[\s\-–—•*>]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * The sentences of the approved copy an ad may use, and why the rest can't.
 *
 * @param {string} copy
 * @param {{ supplement?: boolean }} [opts]
 * @returns {{ usable: string[], excluded: { sentence: string, reason: string }[] }}
 */
export function usableSentences(copy, { supplement = false } = {}) {
  const usable = [];
  const excluded = [];
  const seen = new Set();
  for (const sentence of splitSentences(copy)) {
    const n = words(sentence).length;
    const key = normalizeSentence(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (n < MIN_SENTENCE_WORDS) excluded.push({ sentence, reason: "too short to stand alone" });
    else if (n > MAX_SENTENCE_WORDS) excluded.push({ sentence, reason: "too long for a short video" });
    else if (NOT_SPEAKABLE.test(sentence)) excluded.push({ sentence, reason: "a link, placeholder or email line" });
    else if (PRICE.test(sentence)) excluded.push({ sentence, reason: "states a price, which will change while the video is still up" });
    else if (supplement && SUPPLEMENT_CLAIM.test(sentence)) excluded.push({ sentence, reason: "a health, weight or results claim, which a supplement ad can't make" });
    else usable.push(sentence);
  }
  return { usable, excluded };
}

/**
 * Whether the owner's opening line can lead an ad. It is the owner's own
 * words, used exactly as written -- but a supplement ad still can't open on a
 * claim, and a line can't carry a link.
 *
 * @returns {{ ok: true, line: string } | { ok: false, reason: string }}
 */
export function checkOpeningLine(line, { supplement = false } = {}) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "There's no opening line saved yet." };
  if (words(text).length > MAX_OPENING_WORDS) return { ok: false, reason: `The opening line is longer than ${MAX_OPENING_WORDS} words -- too long to open a short video.` };
  if (NOT_SPEAKABLE.test(text)) return { ok: false, reason: "The opening line has a link or placeholder in it, which can't be spoken in a video." };
  if (supplement && SUPPLEMENT_CLAIM.test(text)) {
    return { ok: false, reason: "The opening line makes a health, weight or results claim, which a supplement ad can't make." };
  }
  return { ok: true, line: text };
}

export const MAX_OPENING_LINES = 5;

/**
 * The lines an ad for this product may open with: the product's own line if
 * it has one, else the owner's rotation, else the older single default.
 */
export function openingLinesFor(product, user) {
  const own = String(product?.ad_opening_line || "").trim();
  if (own) return [own];
  const rotation = (Array.isArray(user?.ad_opening_lines) ? user.ad_opening_lines : [])
    .map((l) => String(l || "").trim())
    .filter(Boolean);
  if (rotation.length) return rotation;
  const single = String(user?.ad_opening_line || "").trim();
  return single ? [single] : [];
}

/** The first line an ad for this product would open with. */
export function openingLineFor(product, user) {
  return openingLinesFor(product, user)[0] || "";
}

/**
 * Rotation: the line used in the fewest ads so far, so every line gets a fair
 * number of ads before their clicks are compared. Ties go to the earlier line.
 *
 * @param {string[]} lines
 * @param {Record<string, number>} usage  ads made so far, by opening line
 */
export function pickOpeningLine(lines, usage = {}) {
  let best = "";
  let bestCount = Infinity;
  for (const line of lines) {
    const count = usage[line] || 0;
    if (count < bestCount) {
      best = line;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Clicks, sales and earnings per opening line, from the links made one per
 * ad. Only clicks on an ad's own link count -- a "link in bio" click can't be
 * traced to the video that sent it, so it scores no line.
 *
 * @param {any[]} links  the owner's affiliate links
 */
export function openingLineStats(links = []) {
  /** @type {Map<string, { opening_line: string, ads: number, clicks: number, conversions: number, earnings: number }>} */
  const byLine = new Map();
  for (const l of links) {
    const line = String(l?.ad_opening_line || "").trim();
    if (!line) continue;
    if (!byLine.has(line)) byLine.set(line, { opening_line: line, ads: 0, clicks: 0, conversions: 0, earnings: 0 });
    const s = byLine.get(line);
    s.ads += 1;
    s.clicks += Number(l.clicks) || 0;
    s.conversions += Number(l.conversions) || 0;
    s.earnings += Number(l.earnings) || 0;
  }
  return [...byLine.values()]
    .map((s) => ({ ...s, earnings: Math.round(s.earnings * 100) / 100, clicks_per_ad: s.ads ? Math.round((s.clicks / s.ads) * 10) / 10 : 0 }))
    .sort((a, b) => b.clicks_per_ad - a.clicks_per_ad || b.ads - a.ads);
}

function fitsBudget(opening, sentences) {
  return words([opening, ...sentences].join(" ")).length <= MAX_SCRIPT_WORDS;
}

/**
 * Builds the script: the opening line, then sentences picked from the
 * approved copy, verbatim.
 *
 * @param {{ product: any, user: any, supplement?: boolean, openingLine?: string, pick?: (sentences: string[]) => Promise<number[]> }} args
 *        `openingLine` is the line rotation chose; without it, the first of
 *        the owner's lines.
 *        `pick` chooses which sentences, by index, in speaking order -- the
 *        model's only say in the script. Whatever it returns is checked
 *        here; without it, or if it returns nothing usable, the first
 *        sentences that fit are used.
 * @returns {Promise<{ outcome: "ok", script: string, opening_line: string, sentences: string[], excluded: number }
 *         | { outcome: "escalate", reason: string, excluded?: { sentence: string, reason: string }[] }>}
 */
export async function composeAdScript({ product, user, supplement = false, openingLine, pick }) {
  const copy = String(product?.approved_copy || "").trim();
  if (!copy) {
    return {
      outcome: "escalate",
      reason: `There's no approved ad copy saved for "${product?.name}". Ads are written only from the vendor's own approved copy -- paste it from the vendor's affiliate page or swipe file, and say where it came from.`,
    };
  }
  if (!String(product?.approved_copy_source || "").trim()) {
    return { outcome: "escalate", reason: `The approved copy for "${product?.name}" has no recorded source. Say where it came from before it's used.` };
  }

  const opening = checkOpeningLine(openingLine || openingLineFor(product, user), { supplement });
  if (!opening.ok) {
    return { outcome: "escalate", reason: `${opening.reason} Every ad starts with your own opening line -- tell me what it should say.` };
  }

  const { usable, excluded } = usableSentences(copy, { supplement });
  const fitting = usable.filter((s) => fitsBudget(opening.line, [s]));
  if (!fitting.length) {
    return {
      outcome: "escalate",
      reason: `None of the approved copy for "${product.name}" can be used in a short video ad${supplement ? " once health, weight and results claims are left out" : ""}. Add other approved copy from the vendor, or check the vendor's rules.`,
      excluded,
    };
  }

  let chosen = [];
  if (pick) {
    try {
      const indices = await pick(fitting);
      for (const i of Array.isArray(indices) ? indices : []) {
        const s = fitting[Number(i)];
        if (s && !chosen.includes(s) && fitsBudget(opening.line, [...chosen, s])) chosen.push(s);
      }
    } catch (err) {
      console.error("Ad script sentence pick failed, using the copy's own order:", err?.message || err);
    }
  }
  if (!chosen.length) {
    for (const s of fitting) {
      if (fitsBudget(opening.line, [...chosen, s])) chosen.push(s);
      if (chosen.length >= 4) break;
    }
  }

  return {
    outcome: "ok",
    script: [opening.line, ...chosen].join(" "),
    opening_line: opening.line,
    sentences: chosen,
    excluded: excluded.length,
  };
}

/**
 * Checks a script handed in from outside (by the assistant, or typed by the
 * owner) against the same rule: the opening line first, then only sentences
 * from the approved copy.
 *
 * Any of the owner's opening lines may lead it; `opening_line` says which.
 *
 * @returns {{ outcome: "ok", script: string, opening_line: string } | { outcome: "prohibited" | "escalate", reason: string }}
 */
export function checkSuppliedScript(script, { product, user, supplement = false }) {
  const lines = openingLinesFor(product, user);
  const checked = lines.map((l) => checkOpeningLine(l, { supplement }));
  const valid = /** @type {{ ok: true, line: string }[]} */ (checked.filter((c) => c.ok));
  if (!valid.length) {
    const first = checked.find((c) => !c.ok);
    const reason = first && !first.ok ? first.reason : "There's no opening line saved yet.";
    return { outcome: "escalate", reason: `${reason} Every ad starts with your own opening line.` };
  }
  if (!String(product?.approved_copy || "").trim() || !String(product?.approved_copy_source || "").trim()) {
    return { outcome: "escalate", reason: `There's no approved ad copy (with its source) saved for "${product?.name}" to check this script against.` };
  }

  const text = String(script || "").replace(/\s+/g, " ").trim();
  const opening = valid
    .filter((o) => normalizeSentence(text).startsWith(normalizeSentence(o.line)))
    .sort((a, b) => b.line.length - a.line.length)[0];
  if (!opening) {
    return { outcome: "prohibited", reason: `The script has to start with one of your opening lines exactly: ${valid.map((o) => `"${o.line}"`).join(" or ")}` };
  }
  const rest = text.slice(opening.line.length).trim();
  const allowed = new Set(usableSentences(product.approved_copy, { supplement }).usable.map(normalizeSentence));
  const body = splitSentences(rest);
  if (!body.length) return { outcome: "prohibited", reason: "The script has nothing after the opening line from the approved copy." };
  for (const sentence of body) {
    if (!allowed.has(normalizeSentence(sentence))) {
      return {
        outcome: "prohibited",
        reason: `"${sentence}" isn't in the vendor's approved copy${supplement ? " (or is a claim a supplement ad can't make)" : ""}. Ads may only use the approved copy word for word.`,
      };
    }
  }
  if (words(text).length > MAX_SCRIPT_WORDS) return { outcome: "prohibited", reason: `The script is over ${MAX_SCRIPT_WORDS} words -- too long for a 30-second ad.` };
  return { outcome: "ok", script: text, opening_line: opening.line };
}
