# Affiliate Pro X

Your affiliate marketing command center — a React PWA for creating trackable
affiliate links, generating compliant social posts, tracking clicks and
conversions, and paying out earnings.

## Stack

| Layer    | What runs                                                                 |
| -------- | ------------------------------------------------------------------------- |
| Frontend | Vite + React 18 SPA (React Router, TanStack Query, Tailwind + shadcn/ui)  |
| Backend  | Vercel serverless functions in `api/` (Node, one file per route)          |
| Data     | Supabase — Postgres + Auth + Storage                                      |
| AI       | Anthropic (Maya/Atlas assistants, post generation), OpenAI (text-to-speech) |
| Payments | Stripe and PayPal checkout (both live), webhooks, Stripe Connect payouts |
| Email    | Resend                                                                    |

This app began on Base44 and was migrated to the stack above. `base44/` still
holds the original project definition (entity schemas, agent configs, and the
Deno cloud functions) as reference — **it is not what runs in production**. See
`CLAUDE.md` for the full architecture and the rules for keeping the two sides in
sync.

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` (gitignored) with your Supabase project's public values:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Server-side secrets are **not** read from `.env.local` — the functions in `api/`
read `process.env` and are configured in the Vercel project settings. The full
list is in `CLAUDE.md` under "Environment variables".

## Scripts

| Command             | Does                                                            |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Vite dev server                                                 |
| `npm run build`     | Production build to `./dist`                                    |
| `npm run lint`      | ESLint (`src/components`, `src/pages`, `src/Layout.jsx`)         |
| `npm run typecheck` | `tsc -p ./jsconfig.json` — JS type-checking via `checkJs`        |
| `npm test`          | Node's built-in test runner over `tests/*.test.mjs`             |

## Deployment

Pushing to `main` on GitLab deploys to production: Vercel builds `dist/` and
serves `api/*` as serverless functions. Server-side secrets live in the Vercel
project's environment variables (full list in `CLAUDE.md`), and a changed value
only takes effect on the next deploy.

`vercel.json` rewrites the legacy `/functions/<name>` paths to `/api/<name>` and
schedules eight jobs — one every 5 minutes, one hourly, six daily (times in UTC):

| Job                       | Time   | Does                                                    |
| ------------------------- | ------ | ------------------------------------------------------- |
| `autoFindProductImages`   | 5 min  | Finds a picture for each new product; retries misses nightly |
| `reconcilePaypalPayments` | hourly | Finishes PayPal checkouts left pending over 15 minutes  |
| `refreshInstagramToken`   | 04:00  | Keeps every connected Instagram account's token alive   |
| `syncTrendingLinks`       | 06:00  | Adds links for currently trending ClickBank products    |
| `syncEbayTrending`        | 07:00  | Adds links for currently trending eBay products         |
| `optimizeAutopilotPosts`  | 09:00  | Autopilot's 48-hour keep-what-earned rotation           |
| `dailyPerformanceSummary` | 12:00  | Emails admins a summary of links, clicks and earnings   |
| `processAutoPayouts`      | 13:00  | Creates payouts that are due under users' schedules     |

The 5-minute and hourly jobs need Vercel Pro (Hobby allows daily crons only);
the hourly one also needs the PayPal variables under "PayPal setup".

`autoFindProductImages` reads each vendor's sales page for its sharing picture
(the same finder as Maya's `find_product_images`, which never makes an
affiliate click) for every product added since the last run, whatever created
it. Between 06:00 and 10:00 UTC it also retries products still without a
picture, each at most once a night. It only fills an empty picture and saves
it as `image_source = 'sales_page'`, so vendors that allow only official
creatives still refuse it in an ad. Each attempt is noted on the product in
`image_lookup_at` / `image_lookup_note`. Three others depend on integrations beyond the
basics: the eBay sync needs
`EBAY_APP_ID`, `EBAY_CERT_ID` and an eBay Partner Network campaign ID saved on
the Networks page; the Instagram refresh needs `INSTAGRAM_APP_SECRET`; and the
daily summary sends through Resend (see below).

Scheduled runs authenticate with `CRON_SECRET`, not a user token. It can be any
long random string, but Vercel refuses to deploy if it has leading or trailing
whitespace.

## Stripe setup

- `STRIPE_SECRET_KEY` is the `sk_live_…` value from Developers → API keys →
  Secret key, not the key's ID (`mk_…`) that Stripe lists next to it.
- Monthly and Yearly prices are looked up by lookup key
  (`affiliate_pro_x_monthly`, `affiliate_pro_x_yearly`) in whichever Stripe
  account the key belongs to, and created there on the first checkout at the
  amounts in `src/lib/pricingPlans.js`. Lifetime is priced inline. There is
  nothing to create in the Stripe dashboard.
- The webhook has to exist in Stripe (Workbench → Webhooks → Add destination),
  pointed at `https://<your-domain>/api/stripeWebhook` and listening to
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted` and
  `invoice.payment_succeeded`. Its signing secret (`whsec_…`) goes in
  `STRIPE_WEBHOOK_SECRET`. Without the webhook, customers pay but are never
  upgraded.

## PayPal setup

PayPal runs alongside Stripe: the Pricing page offers both for every plan.
Lifetime is a one-time PayPal Order; Monthly and Yearly are PayPal
Subscriptions. Everything below goes in the Vercel project's environment
variables.

- **App credentials.** In developer.paypal.com → Apps & Credentials, switch to
  **Live** and open the app. Its Client ID goes in `VITE_PAYPAL_CLIENT_ID` and
  its secret in `PAYPAL_CLIENT_SECRET`. The server functions read the client ID
  too, so the `VITE_` name is deliberate.
- **Plans.** Unlike Stripe, PayPal will not start a subscription without a plan
  that already exists. Create one Monthly and one Yearly plan (Pay & Get Paid →
  Subscriptions → Plans) at the amounts in `src/lib/pricingPlans.js`, and put
  their IDs (`P-…`) in `PAYPAL_MONTHLY_PLAN_ID` and `PAYPAL_YEARLY_PLAN_ID`.
  Lifetime needs no plan.
- **Webhook.** On the same app, add a webhook pointed at
  `https://<your-domain>/api/paypalWebhook` and subscribed to
  `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`,
  `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED` and
  `PAYMENT.SALE.COMPLETED`. Its Webhook ID goes in `PAYPAL_WEBHOOK_ID`. Without
  it the webhook rejects every event (it cannot verify signatures), so renewals
  and cancellations never reach the app.
- **Sandbox.** `PAYPAL_ENV=sandbox` points the API at PayPal's sandbox. It only
  changes the host, so the client ID, secret, plan IDs and webhook ID must all
  be swapped to the sandbox app's values as well. Leave it unset for live.

A buyer who pays and then closes the tab before returning to
`/payment-success` is not lost: checkout records a pending payment first, and
the hourly `reconcilePaypalPayments` job captures or abandons anything still
pending after 15 minutes.

## Google Drive creatives setup

Many ClickBank and Digistore24 vendors hand affiliates a Google Drive folder of
official creatives, and some allow nothing else in an ad. Maya's
`import_official_creatives` tool copies such a folder into the `uploads`
bucket, marks every file official, and attaches it to the product (see
`api/_lib/driveCreatives.js`). It needs one variable, `GOOGLE_API_KEY`, which
you create yourself:

1. In the Google Cloud console, pick or create a project, then APIs & Services
   → Library → **Google Drive API** → Enable.
2. APIs & Services → Credentials → Create credentials → **API key**.
3. Edit the key → API restrictions → **Restrict key** → tick only Google Drive
   API. Leave application restrictions at None: the calls come from Vercel's
   servers, not a browser or a fixed IP.
4. Add it to Vercel as `GOOGLE_API_KEY` and redeploy.

An API key can only read what is shared as "Anyone with the link can view". A
private folder looks the same to Google as a missing one, so either way the
import stops, copies nothing and says the folder is private. Nothing is
marked official unless you say where the folder link came from (the vendor's
affiliate page, an email from the vendor); that answer is saved with every
file. Every attempt, including refused and private ones, is logged in the
`creative_imports` table. Swipe-copy Google Docs in the folder become the
product's approved ad copy (below) when none is saved yet.

## Video ad scripts

For a vendor product, a video ad's voiceover is the owner's own opening line
followed only by sentences from the vendor's approved copy, word for word
(`api/_lib/adScripts.js`). The model only picks which sentences, by number;
code assembles them, and a script handed in from outside is checked sentence
by sentence and refused if any sentence isn't in the copy. Links,
placeholders, email lines and prices are set aside, and so are health, weight
and results claims in a supplement's copy.

The owner gives Maya the copy (`save_approved_copy`, with where it came from)
and an opening line (`set_opening_line` — a default for every ad, or one
product's own). With either missing, no ad is made; Maya asks for it. eBay
listings have no vendor copy: their script is still written from the
listing's own facts, after the opening line.

The owner can keep up to five opening lines (`set_opening_line` with mode
`add`); they take turns across ads, least-used first. Each ad gets its own
tracking link (`ad_link`, stored with `affiliate_links.ad_opening_line`), and
`opening_line_stats` compares lines by clicks per ad. Only clicks on an ad's
own link count: a "link in bio" click can't be traced to the video that sent
it, so an ad's own link is never the one put on the share page.

## Email setup

`api/_lib/email.js` sends through [Resend](https://resend.com). Email is the
only integration here that fails soft on purpose — a send that cannot go out
logs and returns false rather than taking down the job that asked for it — so
misconfiguration is quiet by design. Two variables control it:

- `RESEND_API_KEY` — the `re_…` value from Resend → API Keys. Resend shows a
  key once, at creation; there is no way to read it back later. Without this,
  nothing is sent at all.
- `RESEND_FROM` — optional. Defaults to `Affiliate Pro X
  <onboarding@resend.dev>`, Resend's shared sender, which works on an account
  with no DNS configured. Point it at your own address only after verifying
  that domain in Resend → Domains, which means adding the DKIM, SPF and return
  path records it gives you. Resend rejects any `From` on an unverified domain,
  so setting this ahead of verification turns every send into a 403.

Only `dailyPerformanceSummary` sends mail today, and only to profiles with
`role = 'admin'`. Nothing in the app emails end users, so an unverified domain
is not currently a limitation — Resend's shared sender delivers to the account
owner's own address, which is who the summary is for.
