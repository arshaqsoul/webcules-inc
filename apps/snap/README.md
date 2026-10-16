# Snap

Photographer studio platform — snap.webcules.com. Project management lives in
Linear (project **Snap**); architecture in the four project docs (system,
security, domain model, design system).

## Stack

- **Next.js App Router via [vinext](https://github.com/cloudflare/vinext)** (Vite-based
  Next.js reimplementation — Cloudflare's recommended path for new Next apps) on
  Workers. This app deliberately uses the current stack, not the repo's older
  OpenNext pattern.
- Bindings via `import { env } from "cloudflare:workers"` (`wrangler types`
  regenerates `worker-configuration.d.ts`).
- **D1** `webcules-snap` (dedicated — tenant data isolated from webcules-cms) +
  Drizzle. **R2** `snap-webcules` (private). **Email**: Cloudflare Email Service
  (`send_email` binding) + the `snap-email` inbound worker (apps/snap-email).
- UI: `@webcules/ui` primitives themed with Snap's Linear-style dark tokens
  (`app/globals.css` — see the *Snap · Design System* doc).

## Commands

```
pnpm --filter snap dev              # vinext dev (workerd, local bindings)
pnpm --filter snap build            # production build
pnpm --filter snap run deploy       # build + deploy to snap.webcules.com
                                     # (`run` is required: pnpm reserves bare `deploy`)
pnpm --filter snap typecheck
```

Secrets: `.dev.vars` locally (see `.dev.vars.example`); production via
`wrangler secret put`. Migrations are explicit — never run during builds.

## D1 migrations (tracked ledger — WEB-468)

Remote migrations go through the ledger tool ONLY, never bare
`wrangler d1 execute --file` (hand-applies with no record are how production
missed 0074/asset.mid_key and client galleries 500'd — twice):

```
node scripts/migrate.mjs status staging      # or production — inspect the ledger
node scripts/migrate.mjs apply staging       # staging FIRST, verify the app there
node scripts/migrate.mjs apply production    # then prod
```

A migration counts as applied only when its file name is a row in that
database's `d1_migrations` table. `node scripts/deploy.mjs` preflight
REFUSES to deploy (staging and production, no override) unless EVERY
`migrations/*.sql` file is on the target's ledger.

