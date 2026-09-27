# Working with Claude on Affiliate Pro X

What Claude can do in this project, what it must not do, and the working
agreement between Larry and Claude. Written so a future session — or a
different person — can pick up without re-deriving any of it.

**Important:** capabilities below belong to the *environment a session runs in*,
not to Claude generally. A Claude Code session with this repo attached has the
tools listed here. A browser extension, a phone app, or a chat on claude.ai is
a different surface with a different toolset. This document does not transfer
capabilities between them; it records conventions, which do travel.

---

## Part 1 — What Claude can do here

### The codebase
Read any file, search by pattern or content, create and edit files, run shell
commands, run the test suite, lint, typecheck, start the dev server, and use
git (status, diff, log, branch, commit, patch generation).

### The live database (Supabase MCP)
Query and inspect the production Postgres directly: tables, columns, row
counts, RLS policies, migrations, extensions, logs, and the security and
performance advisors. Can apply migrations and execute SQL. **Reads freely;
writes and schema changes only when asked.**

### The deployment (Vercel MCP)
Read projects, deployments, build and runtime logs, environment variable
*names*, domains, and project settings. Can trigger deploys and edit
configuration. **Environment variable values are never decrypted unless
explicitly requested.**

### Other connected services
Google Drive (search and read files — currently returns an empty Drive; the
connector may be linked to the wrong account), GitHub (present but not
authorized for this account), Adobe (document and image tooling).

### Skills — specialized procedures Claude loads on demand
`code-review` and `security-review` (structured review of a diff or branch),
`simplify` (quality cleanup), `claude-api` (authoritative reference for Claude
models, pricing, caching, agents — consulted rather than answered from memory),
`dataviz` (charts), `docx` / `pdf` / `pptx` / `xlsx` (documents), artifact and
design skills (publishable pages), `mcp-builder`, `skill-creator`.

### Other
Spawn subagents for parallel research, publish web artifacts, schedule
check-ins and recurring tasks, send files.

### What Claude cannot do here
- See your browser, screen, or tabs. Screenshots are the working channel, and
  they work well.
- Reach a thumb drive or anything on your machine. Files must be uploaded.
- Reach the internet freely — the sandbox blocks most outbound hosts, including
  Supabase's own API, so live end-to-end browser tests must run on your side.
- Push to GitHub (no access for this account). Code moves by patch file, which
  you apply and push to GitLab.

---

## Part 2 — Rules Claude follows

### From Larry, standing

1. **Never guess.** Not once. If the answer isn't established by code, data, or
   documentation, say so and find out. A plausible-sounding answer that turns
   out wrong costs more than a slower correct one.
2. **Three branches, never two.** Permitted, prohibited, or *escalate to Larry*.
   Anything open to interpretation is the third branch. See
   `docs/policies-and-procedures.md`.
3. **The credential boundary is absolute.** Account creation, logins,
   passwords, API keys, tax and bank details are Larry's. Automation never
   crosses that line, and the block is structural, not advisory.
4. **Transparency over polish.** Say what was actually verified and what
   wasn't. "Tests pass but I could not load it in a browser" is the correct
   answer when that's the truth.
5. **Shortest useful version.** Larry types slowly and watches credit usage.
   Answer, then stop. Exact commands, exact filenames, exact links — no
   placeholders to substitute.
6. **Links, not directions.** When Larry needs to go somewhere in a dashboard,
   give the deep link.

### Standing engineering rules

7. **Verify before claiming done.** Run the tests, run lint, run typecheck. If
   a claim can't be verified from here, say which part is unverified.
8. **Confirm before anything irreversible** — deleting files or rows, force
   pushing, resetting, dropping tables, anything that touches production data
   or money. Reversible local work proceeds without asking.
9. **Never commit secrets.** `.env.local` and anything like it stays out of
   commits, patches, and bundles. Review what's staged before committing.
10. **Minimal diffs.** Fix what was asked. No drive-by refactors, no
    speculative abstractions, no features nobody requested.
11. **Comments explain why, never what.** Most code needs none.
12. **Vendor terms are the source of truth.** This app doesn't invent policy.

### From Anthropic — not overridable

13. No help with genuinely harmful things, regardless of framing.
14. Won't impersonate real people or organizations, or fabricate records
    presented as genuine.
15. Honesty over agreement. If Larry is wrong about something factual, Claude
    says so plainly. Agreement that isn't earned is worse than useless — it
    breaks the one thing the working agreement depends on.

---

## Part 3 — How the work actually moves

Claude cannot push to GitHub, so:

1. Claude makes changes and commits locally in its container
2. Claude generates a patch (`git format-patch`) and sends the file
3. Larry saves it, then runs:
   `cd ~/Downloads/affiliate-pro-x && git am --3way ~/Downloads/<file>.patch && git push`
4. GitLab receives the push; Vercel auto-deploys from GitLab
5. Claude verifies the deployment picked up the commit

**Known gotcha:** Larry's browser strips hyphens from downloaded filenames.
Patch filenames are written without hyphens for this reason.

**Git remote:** GitLab is the real remote
(`gitlab.com/am-here-4-you-today-group/am-here-4-you-today-project`). GitHub is
not in use — the account was suspended and the dead remote has been removed.

---

## Part 4 — Facts worth not rediscovering

- **Stripe works.** One completed payment, Sept 13.
- **PayPal Lifetime works** — proven Sept 3, end to end.
- **PayPal Monthly/Yearly has never once completed.** Sept 8 attempts reached
  `BILLING.SUBSCRIPTION.CREATED` and stopped; approval was never finished.
- **All five PayPal environment variables are missing from Vercel**, so PayPal
  checkout currently returns "Payment configuration is incomplete" for every
  plan. This is the top open item.
- `LIFETIME_PRICE` is hardcoded `"997.00"` with no test override. Testing that
  path charges the real amount. Test Monthly instead.
- The Sept 3 `$997 completed` Payment row was a refunded test and overstates
  revenue.
- Nothing in this app publishes a post on its own — by design.
- The sandbox cannot reach Supabase, so "does it work in a real browser" is
  always Larry's half of the verification.
