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
| Payments | Stripe (subscription checkout, webhooks, Connect payouts)                 |
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

There is no test suite configured yet.

## Deployment

Vercel builds `dist/` and serves `api/*` as serverless functions. `vercel.json`
rewrites the legacy `/functions/<name>` paths to `/api/<name>` and defines three
cron jobs (auto-payouts, daily performance summary, trending-link sync), which
authenticate with `CRON_SECRET` rather than a user token.
