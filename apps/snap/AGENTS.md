# Snap — agent instructions

Snap is the multi-tenant photographer SaaS at **https://snap.webcules.com** (vinext/Next.js on
Cloudflare Workers, D1 + R2, Better Auth, Stripe). Everything below is standing policy — follow it
in every session, and keep this file current when the environment changes.

## Deploy policy — STAGING FIRST, ALWAYS

**Every change ships to staging and is verified there before production. No exceptions.**

```bash
cd apps/snap
node scripts/deploy.mjs staging                      # build → deploy → smoke-check
# …verify your change at https://snap-staging.webcules.com (exercise the real flow)…
node scripts/deploy.mjs production --staging-verified  # ONLY after verifying
```

- The production command **refuses to run** without `--staging-verified` — that flag is your
  assertion the same code was deployed to staging and manually exercised (surface the change, hit
  the API, check D1 rows — not just a 200 on `/`).
- `scripts/deploy.mjs` clears the stale caches that have burned us before
  (`node_modules/.vite`, `.vinext`, `.vitest`, `*.tsbuildinfo`) before every build. If you deploy
  any other way, clear them yourself.
- Never deploy from a dirty tree you don't fully own; commit (or stash) first so the deploy is
  traceable to a commit.

## Environments

| | Production | Staging |
|---|---|---|
| URL | https://snap.webcules.com | https://snap-staging.webcules.com |
| Worker | `webcules-snap` | `webcules-snap-staging` |
| D1 | `webcules-snap` (`badece16-2231-4b37-81ac-54f7c4bbf464` — recreated fresh 2026-09-29 at launch; pre-launch backup in repo `.backups/`) | `webcules-snap-staging` (`9b850d02-67d3-4c1b-a7ed-482cc587b2d5`) |
| R2 | `snap-webcules` | `snap-staging` |
| Stripe | TEST keys today; live keys at launch (see below) | TEST keys (sandbox) |
| Cron | `webcules-snap-email` daily 06:00 UTC → `POST /api/cron/daily-status` | none — call the endpoint manually (below) |

- Staging has its **own** `BETTER_AUTH_SECRET` and `SNAP_INBOUND_WEBHOOK_SECRET` (set via
  `cf workers secrets update <NAME> --worker webcules-snap-staging --type secret_text --text …`).
  Never copy production secret values into staging or vice versa.
- Stripe on staging = the sandbox/test keys (`sk_test_…` + a webhook endpoint pointed at
  `https://snap-staging.webcules.com/api/stripe/webhook` — its `whsec_…` is staging's
  `STRIPE_WEBHOOK_SECRET`). Billing needs no product setup: prices are auto-created by metadata.
- Turnstile is disabled on staging (no site key / no secret → widgets skip, verification passes).
- Staging sends REAL email (Cloudflare Email Service) with display name "Snap Staging" — use
  inboxes you control.
- Staging smoke account: `launch-smoke@webcules.com` / `TestPass123!x` (org
  `37d24772-98e5-4371-bcd1-2e0424361b0d`, plan free). Recreate freely; staging data is disposable.
- Manual staging cron: `curl -X POST -H "Authorization: Bearer $STAGING_SNAP_INBOUND_WEBHOOK_SECRET" https://snap-staging.webcules.com/api/cron/daily-status`
- `snap-fallback.webcules.com` and `gallery-test.webcules.com` are PROD-ONLY routes (Custom
  Hostnames fallback origin + serving-guard probe). They must never appear in the staging config.
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

## Standing rules (carried from earlier sessions)

- Use the global `cf` CLI (authenticated as webculesco@gmail.com) for Cloudflare interaction;
   `npx wrangler` only for gaps (D1 file executes, generated-config deploys) — flag it when you do.
- Prod data safety: the user's own org `86802869` is read-only; founder org **Willow and Pine
  Photo** (`59753bbb`) must not be touched. Prod test account: `skeleton-test-1790499008@webcules.com`
  / `TestPass123!x` (org `f78f045e-2b87-44f2-aae0-0543d5530a05`, keep on plan=free between
  verifications). Revert test data when done; delete temp secret files (`.token.tmp`, cookie jars).
- `.dev.vars` holds real secrets (`BETTER_AUTH_SECRET`, `SNAP_INBOUND_WEBHOOK_SECRET`) —
  gitignored, never commit, never paste.
- Prod Stripe secrets are TEST keys until the founder supplies live keys; when swapping, also
  create the LIVE-mode webhook endpoint → `https://snap.webcules.com/api/stripe/webhook` and set
  its `whsec_…` as prod `STRIPE_WEBHOOK_SECRET`.
- Test constraints: routes importing `next/headers` can't run under workerd tests — test the
  repos instead; JSX can't be imported into tests — keep helpers in pure `lib/`.
- Zero third-party analytics scripts on client surfaces (grep before shipping marketing claims);
  no "screenshot protection" copy anywhere.

## Free tier (what $0 actually gets — enforced in `lib/plans-data.ts`)

20 GB storage (3 GB of it may be RAW) with 40 GB hard upload lock · unlimited bookings/leads/
projects/invoices/contracts-signatures (2 contract TEMPLATES, 5 email snippets, 1 contact form,
1 questionnaire, 1 session type) · 5 concurrently-active galleries with the full client feature
set · folders + folder delivery · classic gallery, basic slideshow, video delivery. Everything
beyond this greets the photographer with an upgrade CTA → `/dashboard/settings/billing` (the
PlanPanel pricing page). Keep `lib/tier-cards.ts`, the landing grid, and `lib/plans-data.ts` in
sync — `tests/unit/pricing-tiers.test.ts` + `gate-matrix` enforce it.
