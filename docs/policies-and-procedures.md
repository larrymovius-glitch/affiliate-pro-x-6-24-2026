# Affiliate Pro X — Policies and Procedures

The operating rules for anything automated in this app: what agents and bots
may do, what they must refuse, and what has to come back to a human. These are
not aspirations. Each rule below names where it is enforced in code and the
test that proves it, because a rule the model is merely *told* about is a rule
that holds until it doesn't.

---

## 1. The three-branch rule

Every enforcement check has **three** outcomes, never two:

| Outcome | Action |
|---|---|
| Clearly permitted by the vendor's terms | proceed |
| Clearly prohibited by the vendor's terms | refuse |
| **Anything else — unclear, undocumented, open to reading two ways** | **stop and escalate to the account owner** |

Ambiguity is a guess, and guesses are not permitted. "Probably fine" is the
third branch, not the first. A check that can only return allow/deny is
incomplete and must be rewritten before it ships.

Enforced today in `api/_lib/vendorApplicationBot.js` (`draftFillPlan` splits
fields into `readyToFill` and `needsReview` by confidence; `needsReview` is
never pre-filled and never auto-submitted) and in
`src/pages/VendorApplications.jsx` (a `needsReview` field joins the submission
only after the user types a value and confirms it).

Also enforced in `api/_lib/driveCreatives.js` (`checkDriveImport`): a vendor's
Drive folder is imported and marked official only when the owner has said
where the link was published; with no source it escalates instead of
guessing, and a private folder stops the import with nothing copied. Tests:
`tests/drive-creatives.test.mjs`.

## 2. Vendor terms are the source of truth

The app does not invent policy. Every restriction traces to a specific rule
published by a vendor, network, platform, or regulator. Where their rules and
convenience disagree, their rules win.

This is also why rules get encoded rather than summarized: a vendor's terms are
prose, and prose cannot be enforced. Each rule that matters is translated into
a function that refuses, with a test pinning the refusal.

## 3. The credential boundary

The account owner — a human — owns everything that establishes identity:

- account creation and registration
- logins, passwords, MFA
- API keys, secrets, OAuth authorizations
- tax forms, bank details, payout routing

Automation inherits an environment it did not create. It never crosses this
line, and the block is structural, not advisory.

Enforced in `api/_lib/vendorApplicationBot.js` — `ALLOWED_ACTIONS` is a frozen
list of exactly three permitted actions, and `checkVendorBotAction()` refuses
any URL or form bearing account-level markers (signup, login, password,
billing, payout setup, bank account, tax form, W-9/W-8, SSN, EIN) *before* a
browser is ever launched. Tests: `tests/vendor-application-bot-boundary.test.mjs`.

## 4. Structural enforcement, not instruction

A rule that exists only in a prompt is a preference. A rule that exists as a
function which returns an error is a policy. Anything in this document that
matters is the second kind.

Practical form: the check runs before the side effect, refuses by throwing or
returning an error, and has a test that fails if the refusal stops working.

Example: video ad scripts for vendor products (`api/_lib/adScripts.js`). The
model is not told "use only the approved copy" and trusted to: it picks
sentences by number and code assembles them verbatim after the owner's opening
line; a supplied script with any sentence not in the copy is refused
(`checkSuppliedScript`); missing copy, source or opening line escalates to the
owner (`composeAdScript`). Tests: `tests/ad-scripts.test.mjs`.

## 5. Least privilege for credentials

Each automated component gets the narrowest credential that lets it do its job
— read-only where it only reads, posting-only where it only posts. Vendors
cannot tell an agent's API call from a human's, so the blast radius of a
mistake is defined entirely by what the key in play can reach. That scoping is
the real security boundary.

## 6. Nothing publishes itself

No post, application, or outbound message leaves this app without a human
approving that specific item. Drafting, scoring, and queueing are automated;
the act of publishing is not.

Enforced in `api/optimizeAutopilotPosts.js` (scores and archives drafts, never
publishes) and `api/submitVendorApplication.js` (runs only on the exact
approved mappings the review page sends; refuses an empty approval set, and
never clicks submit when every approved field turned out to be missing from the
live page).

## 7. Everything automated is auditable after the fact

Any action taken on the user's behalf is recorded with enough detail to
reconstruct it — what was attempted, against what, with what result, success or
failure alike. A failed attempt is as important to record as a successful one.

Enforced in `api/submitVendorApplication.js` (writes a `VendorApplication` row
for every attempt) and surfaced in `src/pages/VendorApplications.jsx`
(submission history, visible permanently, successes and failures together),
and in `api/_lib/driveCreatives.js` (writes a `CreativeImport` row for every
Drive import attempt: imported, partial, private, refused, escalated or
failed).

## 8. Disclosure is not optional

Affiliate relationships are disclosed on every piece of promotional content,
per FTC guidance and network terms. This is applied automatically rather than
left to the author.

Enforced in `src/components/AffiliateDisclosure.jsx` and in generated post
content ("I may earn from qualifying purchases").

---

## Adding a rule

1. Find the vendor's actual published term. Quote it.
2. Reduce it to something checkable — a condition a function can evaluate.
3. Write the function so it refuses before the side effect happens.
4. Write a test that fails if the refusal stops working.
5. Add a row here naming the rule, the file, and the test.

If step 2 can't be done — the term is genuinely open to interpretation — then
it belongs in the third branch of rule 1: escalate, don't encode a guess.
