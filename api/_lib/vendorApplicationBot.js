// The vendor-application bot's hard safety boundary. Every action the bot
// takes on an external site must be checked against this before it runs --
// not a guideline the calling code is expected to remember, a gate nothing
// downstream can route around.
//
// Only ever permits: reading a vendor's product/affiliate-application form,
// filling it from the user's saved application-profile answers, and
// submitting THAT SAME form. Never permits anything that creates, modifies,
// or authenticates an account on any platform -- that stays a human action,
// always, no exceptions, no "just this once."
export const ALLOWED_ACTIONS = Object.freeze(["read_application_form", "fill_application_form", "submit_application_form"]);

// Substrings that, if found anywhere in a candidate action's own description
// or target URL, force a block regardless of which ALLOWED_ACTIONS type was
// requested. Belt-and-suspenders: even a bug that mislabels an action can't
// walk through this gate if the target itself smells like an account
// operation.
const ACCOUNT_LEVEL_SIGNS = [
  "signup", "sign-up", "sign_up", "register", "create-account", "create_account",
  "new-account", "new_account", "login", "log-in", "sign-in", "signin",
  "password", "billing", "payout-setup", "bank-account", "tax-form", "w-9", "w9", "w-8", "ssn", "ein",
];

/**
 * @param {{ action: string, url?: string, description?: string }} candidate
 * @returns {{ allowed: true } | { allowed: false, reason: string }}
 */
export function checkVendorBotAction(candidate) {
  const { action, url = "", description = "" } = candidate || {};

  if (!ALLOWED_ACTIONS.includes(action)) {
    return { allowed: false, reason: `Action "${action}" is not on the allowlist. Only ${ALLOWED_ACTIONS.join(", ")} are permitted.` };
  }

  const haystack = `${url} ${description}`.toLowerCase();
  const hit = ACCOUNT_LEVEL_SIGNS.find((sign) => haystack.includes(sign));
  if (hit) {
    return { allowed: false, reason: `Blocked: target looks like an account-level action (matched "${hit}"). This bot only ever submits vendor product/affiliate applications, never account creation, login, or financial/identity setup.` };
  }

  return { allowed: true };
}

/**
 * Launches a serverless-compatible headless Chromium. Kept as its own
 * function so readApplicationForm can be tested by injecting a fake
 * `launch` -- spinning up real Chromium in a unit test is neither fast nor
 * necessary to prove the field-extraction and LLM-mapping logic correct.
 */
export async function launchBrowser() {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

/**
 * Reads a vendor application form's actual fields from the live page --
 * every input/textarea/select, matched to its human-readable label by
 * whichever mechanism the page actually uses (a <label for>, aria-label,
 * placeholder, or the nearest preceding text), in that priority order.
 * Returns field descriptions only; nothing is typed or submitted here --
 * that's a separate, explicitly gated step.
 *
 * @param {string} url
 * @param {{ launch?: Function }} [deps] - launch is injectable for tests
 * @returns {Promise<{ url: string, fields: Array<{ selector: string, label: string, type: string, required: boolean }> }>}
 */
export async function readApplicationForm(url, deps = {}) {
  const gate = checkVendorBotAction({ action: "read_application_form", url });
  if (!gate.allowed) throw new Error(gate.reason);

  const launch = deps.launch || launchBrowser;
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    const fields = await page.evaluate(() => {
      const labelFor = (el) => {
        if (el.id) {
          const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (byFor?.textContent?.trim()) return byFor.textContent.trim();
        }
        const wrappingLabel = el.closest("label");
        if (wrappingLabel?.textContent?.trim()) return wrappingLabel.textContent.trim();
        if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
        if (el.placeholder) return el.placeholder;
        // Nearest preceding text node in the DOM as a last resort --
        // common for forms that lay out labels visually without a
        // programmatic association.
        let sib = el.previousElementSibling;
        while (sib) {
          const text = sib.textContent?.trim();
          if (text) return text;
          sib = sib.previousElementSibling;
        }
        return "";
      };

      const els = Array.from(document.querySelectorAll("input, textarea, select"));
      return els
        .filter((el) => !["hidden", "submit", "button", "image", "reset"].includes(el.type))
        .map((el, i) => {
          if (!el.id) el.id = `vab-field-${i}`;
          return {
            selector: `#${el.id}`,
            label: labelFor(el),
            type: el.tagName === "SELECT" ? "select" : el.type || "text",
            required: el.required || el.getAttribute("aria-required") === "true",
          };
        });
    });

    return { url, fields };
  } finally {
    await browser.close();
  }
}

/**
 * Maps a form's real fields to the user's saved application-profile
 * answers via the LLM -- semantic matching by label meaning, not brittle
 * exact-name matching, so a field labeled "Your website" matches
 * website_url the same as one labeled "Site URL".
 *
 * Every mapped field carries a confidence. Anything not "high" is left
 * out of readyToFill and surfaced in needsReview instead -- the calling
 * code must never fill or submit a field this wasn't sure about. This is
 * the guardrail against the bot guessing at an answer to a question it
 * doesn't actually understand.
 *
 * @param {Array<{selector:string,label:string,type:string,required:boolean}>} fields
 * @param {Record<string, any>} profile - user.affiliate_application_profile
 * @param {{ invokeLLM?: Function }} [deps]
 */
export async function draftFillPlan(fields, profile, deps = {}) {
  const invoke = deps.invokeLLM || (await import("./llm.js")).invokeLLM;

  const result = await invoke({
    prompt: `You are matching a web form's fields to a person's saved profile answers, for an affiliate marketer applying to promote a vendor's product.

Form fields (label, type, whether required):
${JSON.stringify(fields, null, 2)}

Saved profile answers:
${JSON.stringify(profile, null, 2)}

For each form field, decide which profile answer (if any) it's asking for. Only mark confidence "high" when you are certain -- a field asking for something not present in the profile, or genuinely ambiguous, must get confidence "low" and value null. Never invent a value that isn't in the profile.`,
    response_json_schema: {
      type: "object",
      properties: {
        mappings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              selector: { type: "string" },
              value: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["high", "low"] },
              reason: { type: "string" },
            },
            required: ["selector", "value", "confidence"],
          },
        },
      },
      required: ["mappings"],
    },
  });

  const mappings = result.mappings || [];
  return {
    readyToFill: mappings.filter((m) => m.confidence === "high" && m.value != null),
    needsReview: mappings.filter((m) => m.confidence !== "high" || m.value == null),
  };
}
