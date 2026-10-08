# Snap — agent instructions

Snap is the multi-tenant photographer SaaS at **https://snap.webcules.com** (vinext/Next.js on
Cloudflare Workers, D1 + R2, Better Auth, Stripe). Everything below is standing policy — follow it
in every session, and keep this file current when the environment changes.

## Deploy policy — STAGING FIRST, BROWSER-VERIFIED, CLEAN TREE

**Every change ships to staging, is verified in a real browser, and only then goes to production.
No exceptions. These rules were paid for on 2026-09-30 — see the incident notes below them.**

```bash
cd apps/snap
node scripts/deploy.mjs staging                      # build → deploy → smoke-check
# …BROWSER-VERIFY at https://snap-staging.webcules.com (rules below)…
node scripts/deploy.mjs production --staging-verified  # ONLY after browser verification
```

- The production command **refuses to run** without `--staging-verified` — that flag is your
  assertion the same code was deployed to staging and manually exercised.
- **Browser verification means logged-in and rendered.** Open the affected pages in a browser
  (staging smoke account: `launch-smoke@webcules.com` / `TestPass123!x`) and see the actual UI —
  authenticated pages returning `307 → /login` to curl prove nothing. Dashboard/auth-gated pages
  must be exercised logged in, or covered by an e2e that logs in
  (`tests/e2e/specs/templates-sections.spec.ts` is the pattern). A `200` on `/` is not verification.
- **Never deploy a dirty tree you don't fully own.** Run `git status` before every deploy: if any
  file you didn't write is modified (another agent's in-flight work), STOP — coordinate or wait.
  Building from a shared working tree ships everyone's half-finished code; this caused a full
  production outage (all `/dashboard/*` routes 500ing) on 2026-09-30.
- **`pnpm typecheck` must pass before any deploy.** Type errors anywhere in the tree block the
  deploy — even "not my files" ones. vinext builds without typechecking, so a red tsc today is a
  broken worker tonight.
- **If production breaks: roll back first, diagnose second.** `npx wrangler deployments list` →
  `npx wrangler rollback <known-good-version-id> --config dist/server/wrangler.json` → verify via
  `cf observability telemetry query` (error-level events) — then investigate calmly.
- `scripts/deploy.mjs` clears the stale caches that have burned us before
  (`node_modules/.vite`, `.vinext`, `.vitest`, `*.tsbuildinfo`) before every build. If you deploy
  any other way, clear them yourself.
- Never deploy from an uncommitted state you can't name; commit first so the deploy is traceable
  to a commit.

## Commits, releases & version tags — every ship is a tagged release

**Every behavior-changing push is committed, pushed, and tagged as a versioned release whose note
drops into the public docs unchanged. Commit messages are written for the docs page, not for git.**

- **Commit format = release-note format.**
  - Subject: `type(snap): WEB-### — <what changed, in photographer-readable words>` (the Linear
    issue id when one exists; `feat` / `fix` / `docs` types as usual).
  - Body: the FIRST paragraph(s) must be the public release note — what users get, in plain
    language, pasteable verbatim into `lib/docs/content/releases.tsx`. Technical detail (files,
    migrations, test counts, incident notes) goes in trailing paragraphs below a `---` line —
    never above the user-facing text.
- **Every release gets a version tag.**
  - `vX.Y.Z`, semver-ish: user-visible feature → minor bump, fix → patch, breaking/data-model
    flip → major (rare; needs the founder).
  - In the release commit: bump `version` in `apps/snap/package.json`, append the entry (version,
    date, the commit's release paragraphs) to the TOP of `lib/docs/content/releases.tsx`, then:
    `git tag -a vX.Y.Z -m "<release note>"` and `git push origin master --tags`.
  - Never move or delete a pushed tag — a bad release gets a new patch tag, not a rewritten one.
- **The docs Releases page is the changelog** (`/docs/releases`, registered in
  `lib/docs/nav.ts` under Product updates). If a change is too small to announce (typos, test
  infra, internal refactors), fold it into the next release's entry instead of tagging noise —
  but it still gets a normal commit + push.
- **Push always.** No deploy ships from an unpushed commit, and no finished work stays local past
  the end of a task. Paused mid-feature? Commit + push with a `wip:` subject (WIP commits are
  never tagged).
- Baseline: `v0.1.0` = the 2026-09-29 production launch. History before it is untagged and lives
  as one summary entry; from `v0.2.0` on there is exactly one docs entry per tag.

## Environments

| | Production | Staging |
|---|---|---|
| URL | https://snap.webcules.com (legacy; moving to snaphq.app) | https://staging.snaphq.app (canonical; snap-staging.webcules.com still attached) |
| Worker | `webcules-snap` | `webcules-snap-staging` |
| D1 | `webcules-snap` (`badece16-2231-4b37-81ac-54f7c4bbf464` — recreated fresh 2026-09-29 at launch; pre-launch backup in repo `.backups/`) | `webcules-snap-staging` (`9b850d02-67d3-4c1b-a7ed-482cc587b2d5`) |
| R2 | `snap-webcules` | `snap-staging` |
| Stripe | LIVE keys + live webhook endpoint (`we_1ULAApDQylYjEBwsSCHyGmh8`, 11 events) — live since 2026-09-29 | TEST keys + test webhook endpoint (`we_1ULAB5DQylYjEBwsnrODOCT8`) |
| Cron | `webcules-snap-email` daily 06:00 UTC → `POST /api/cron/daily-status` | none — call the endpoint manually (below) |

- Staging has its **own** `BETTER_AUTH_SECRET` and `SNAP_INBOUND_WEBHOOK_SECRET` (set via
  `cf workers secrets update <NAME> --worker webcules-snap-staging --type secret_text --text …`).
  Never copy production secret values into staging or vice versa.
- Stripe on staging = the sandbox/test keys (`sk_test_…` + a webhook endpoint pointed at
  `https://snap-staging.webcules.com/api/stripe/webhook` — its `whsec_…` is staging's
  `STRIPE_WEBHOOK_SECRET`). Billing needs no product setup: prices are auto-created by metadata
  (verified in live mode: $15/mo `snap_plan=lite` price auto-created on first checkout).
- Turnstile is disabled on staging (no site key / no secret → widgets skip, verification passes).
- Staging sends REAL email (Cloudflare Email Service) with display name "Snap Staging" — use
  inboxes you control.
- Staging smoke account: `launch-smoke@webcules.com` / `TestPass123!x` (org
  `37d24772-98e5-4371-bcd1-2e0424361b0d`, plan free). Recreate freely; staging data is disposable.
- Manual staging cron: `curl -X POST -H "Authorization: Bearer $STAGING_SNAP_INBOUND_WEBHOOK_SECRET" https://snap-staging.webcules.com/api/cron/daily-status`
- Custom-hostname serving architecture (WEB-233 runbook, verified live on
  prairiepeakgear.com 2026-09-30): zone fallback origin = `snap-saas-origin.webcules.com`
  (ORIGINLESS proxied A → 192.0.2.1 — never a real IP), plus a `*/*` workers route on
  webcules.com → webcules-snap (declared in wrangler.jsonc — a matching route is REQUIRED or
  Cloudflare 522s; more-specific routes like webcules.com/* → landing keep precedence). The
  worker resolves the studio from `x-forwarded-host` (see requestHost in lib/domains.ts).
  Custom hostname payloads: `ssl: {method: "txt", type: "dv"}` — NO `certificate_authority`
  (Enterprise-only on our zone) and no `preserve_host_header`.
- Operator setup (done, one-time): `CLOUDFLARE_ZONE_ID` var in wrangler.jsonc +
  `CLOUDFLARE_API_TOKEN` worker secret = the `snap-saas-full-prod` user token (SSL and
  Certificates R/W + Workers Routes R/W, zone-scoped to webcules.com).
- `gallery-test.webcules.com` is a PROD-ONLY probe route; the staging config never carries it.
- `snap-staging.webcules.com` is in `DEFAULT_APP_HOSTS` (lib/domains.ts) — required so staging
  auth/dashboard paths don't 302 to the production origin.

## D1 migrations

1. Add `migrations/00NN_name.sql` and register it in `tests/helpers/db.ts` (import + `MIGRATIONS`).
2. Apply to **staging first**, then prod: `npx wrangler d1 execute <db-name> --remote --file ./migrations/00NN_name.sql -y`
   (⚠️ the `cf d1 migrations apply` batch mode is broken for this repo — concatenated statements
   fail with SQLITE "incomplete input"; the per-file wrangler loop is the reliable path).
3. `cf d1 query <db-id> --sql "…"` (remote, default) to verify. **Always single-line SQL** —
   Git Bash mangles multiline through cf.
4. Never write to prod orgs you don't own (below).

## Docs are part of the feature (docs-as-practice)

Every user-visible feature or behavior change ships together with its documentation in the public
docs section (`app/docs/*` + `lib/docs/*` — Linear-style shell: sidebar categories, per-page inner
TOC, Copy page / View-as-Markdown, `⌘K` search).

- New feature or changed behavior → add or update the page in `lib/docs/nav.ts` (title,
  description, category) and author `lib/docs/content/<slug>.tsx` from the actual code.
- **Truthfulness rules:** write from the code, not from intent. Every UI label, status, limit,
  and cap quoted in docs must match the code (plan caps come from `lib/plans-data.ts`; when in
  doubt, read the repo/gate code). Tier-gated features carry a `<Tier plan="…"/>` badge — reading
  docs is never gated, features are.
- **Verify before shipping:** run the affected flow on staging in a browser. If the UI/code and
  what the docs would claim disagree, that's a product bug — file a Linear issue, fix the product
  (or the copy), then finalize the doc.
- **Screenshots** live in `public/docs-shots/<slug>/` and render on a gradient panel via the
  `<Shot>` primitive — capture the real staging UI (logged in), never mockups.
- **In-app hints:** surface-level questions link straight to their page via `<DocHint slug="…"/>`
  (components/doc-hint.tsx) instead of making users ask support.
- Docs content is code-walkable: `lib/docs/extract.tsx` powers the TOC, search index, and Markdown
  export — keep content modules sync server components using only the primitives in
  `lib/docs/primitives.tsx`.

## Standing rules (carried from earlier sessions)
- Use the global `cf` CLI (authenticated as webculesco@gmail.com) for Cloudflare interaction;
   `npx wrangler` only for gaps (D1 file executes, generated-config deploys) — flag it when you do.
- Prod data safety: the user's own org `86802869` is read-only; founder org **Willow and Pine
  Photo** (`59753bbb`) must not be touched. Prod test account: `skeleton-test-1790499008@webcules.com`
  / `TestPass123!x` (org `f78f045e-2b87-44f2-aae0-0543d5530a05`, keep on plan=free between
  verifications). Revert test data when done; delete temp secret files (`.token.tmp`, cookie jars).
- `.dev.vars` holds real secrets (`BETTER_AUTH_SECRET`, `SNAP_INBOUND_WEBHOOK_SECRET`) —
  gitignored, never commit, never paste.
- Prod Stripe is LIVE (since 2026-09-29): live secret + live webhook endpoint →
  `https://snap.webcules.com/api/stripe/webhook`. Never run test-mode checkouts against prod or
  live-mode keys against staging; verify billing flows on staging with the test key and 4242 card.
- Test constraints: routes importing `next/headers` can't run under workerd tests — test the
  repos instead; JSX can't be imported into tests — keep helpers in pure `lib/`.
- Zero third-party analytics scripts on client surfaces (grep before shipping marketing claims);
  no "screenshot protection" copy anywhere.

## Free tier (what $0 actually gets — enforced in `lib/plans-data.ts`)

20 GB storage (3 GB of it may be RAW) with 40 GB hard upload lock · unlimited bookings/leads/
projects/invoices/contracts-signatures (2 contract TEMPLATES, 5 email snippets, 1 contact form,
1 questionnaire, 1 session type) · 5 concurrently-active galleries with the full client feature
set · folders + folder delivery · one-click Download all (streamed ZIP parts, any size - every plan) · classic gallery, basic slideshow, video delivery · gallery
cover photo + vignette and the zero-config default hero (cover-only designs; slider/columns
are Studio+ server-enforced, WEB-302) · 5 cover-only gallery templates apply free; the
page-layout templates are Lite/Studio, server-gated (WEB-320). Everything
beyond this greets the photographer with an upgrade CTA → `/dashboard/settings/billing` (the
PlanPanel pricing page). Keep `lib/tier-cards.ts`, the landing grid, and `lib/plans-data.ts` in
sync — `tests/unit/pricing-tiers.test.ts` + `gate-matrix` enforce it.
