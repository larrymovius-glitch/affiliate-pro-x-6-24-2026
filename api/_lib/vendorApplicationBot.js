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
