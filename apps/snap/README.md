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
  (`send_email` binding) + the `webcules-snap-email` inbound worker (apps/snap-email).
- UI: `@webcules/ui` primitives themed with Snap's Linear-style dark tokens
  (`app/globals.css` — see the *Snap · Design System* doc).

## Commands

```
pnpm --filter snap dev              # vinext dev (workerd, local bindings)
pnpm --filter snap build            # production build
pnpm --filter snap run deploy       # build + deploy to snap.webcules.com
                                     # (`run` is required: pnpm reserves bare `deploy`)
pnpm --filter snap db:migrate       # apply migrations/0001_init.sql to local D1
pnpm --filter snap db:migrate:remote# apply to production D1 (explicit, never in CI build)
pnpm --filter snap typecheck
```

Secrets: `.dev.vars` locally (see `.dev.vars.example`); production via
`wrangler secret put`. Migrations are explicit — never run during builds.
