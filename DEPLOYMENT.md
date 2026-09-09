# Webcules Cloudflare Deployment

All three apps run as **Cloudflare Workers** in production on the Webcules account
(`5677ff5e25a4e78485b774931f981681`), built with
[@opennextjs/cloudflare](https://opennext.js.org/cloudflare).

| App | Worker | Domain | Notes |
| --- | --- | --- | --- |
| `apps/cms` | `webcules-cms` | https://cms.webcules.com | Admin UI + REST/GraphQL API + media serving |
| `apps/landing` | `webcules-landing` | https://webcules.com, https://www.webcules.com | Zone routes (apex DNS is externally managed) |
| `apps/backgrounds` | `webcules-backgrounds` | https://backgrounds.webcules.com | Custom domain |

## Shared resources

- **D1 database** `webcules-cms` (id `36b39eea-99a5-45b9-87d2-9f2cb1ba6a03`) — bound as `D1` in all three workers. All apps embed the same Payload config and read/write directly.
- **R2 bucket** `background-webcules` — bound as `R2` in all three workers. Media files are stored at the bucket root (the static handler in `@payloadcms/storage-r2@3.58.x` ignores collection prefixes) and served through the CMS at `/api/<collection>/file/<filename>` so Payload access control applies.
- **Secrets** (set via `wrangler secret put`, per worker): `PAYLOAD_SECRET` (same value everywhere so JWTs work across apps), `CRON_SECRET`, `PREVIEW_SECRET`; `backgrounds` also has `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUBSCRIPTION_PRICE_ID` (Stripe **test** keys — swap for live keys with `wrangler secret put` when going live).

## Deploy

```bash
# from the repo root
pnpm install

# deploy a single app (build + deploy in one step)
cd apps/cms        && pnpm deploy
cd apps/landing    && pnpm deploy
cd apps/backgrounds && pnpm deploy
```

The first deploy of `cms`/`landing`/`backgrounds` attaches the custom domains/routes automatically.

## Database migrations

Payload uses `@payloadcms/db-d1-sqlite` (D1). Migrations live in
`packages/payload/src/migrations-d1` and are applied explicitly (they are NOT
run during builds):

```bash
# create a migration after changing collections (uses local D1, no prod access)
cd apps/cms && pnpm payload migrate:create <name>

# apply pending migrations to the REAL remote D1 database
cd apps/cms && NODE_ENV=production PAYLOAD_SECRET=ignore PAYLOAD_REMOTE_MIGRATIONS=1 pnpm payload migrate
```

`PAYLOAD_REMOTE_MIGRATIONS=1` is what switches the wrangler platform proxy to
remote bindings. Regular builds never touch production data (they fall back to
an empty binding stub — Payload never queries the DB during `next build`).

## Payload config / Cloudflare context

`packages/payload/src/payload.config.ts` resolves Cloudflare bindings:

- **In the deployed worker** — from the OpenNext request context (`getCloudflareContext({ async: true })`), which reads the real `D1`/`R2` bindings.
- **In `payload` CLI commands** (migrate/create/run) — from a wrangler platform proxy (local unless `PAYLOAD_REMOTE_MIGRATIONS=1`).
- **During `next build`** — an empty stub; builds must not depend on bindings.

## Workers-specific adaptations

- `sharp`/`plaiceholder` are removed from the bundle: no image resizing, cropping, focal points, or blur placeholders on upload (Workers can't run sharp). Images are served at original size; `next/image` is `unoptimized` in all apps.
- The production logger routes Payload logs through `console.*` as JSON (`pino-pretty` needs fs).
- Stripe SDK uses `Stripe.createFetchHttpClient()` and `constructEventAsync` (Node's http client doesn't work on Workers). Configure a Stripe webhook endpoint pointing at `https://backgrounds.webcules.com/webhook/stripe`.
- Frontend page groups are `force-dynamic` — content renders per request from D1 (no ISR cache is configured). If you want ISR/tag caching later, add an R2 incremental cache + tag cache to `open-next.config.ts` (see OpenNext caching docs).

## Local development

```bash
cd apps/cms && pnpm dev   # uses wrangler platform proxy: local D1 + local R2
```

`.dev.vars` holds local secrets. The first `payload` command in dev
auto-pushes the schema to the local D1 database.
