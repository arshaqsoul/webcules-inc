# @webcules/dashboard — the Saskatoon pipeline

The internal dashboard for the Webcules go-to-market engine: **leads → redesigns → outreach → payments → $10/mo care plans**. Light-themed, local-first (SQLite file), Stripe when you want it.

Read the strategy first: [`../../docs/GTM-PLAYBOOK.md`](../../docs/GTM-PLAYBOOK.md) and [`../../docs/PRICING.md`](../../docs/PRICING.md).

## Setup (once)

```bash
# from webcules-inc/
pnpm install
cp apps/dashboard/.env.example apps/dashboard/.env.local
# then edit .env.local: set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm --filter @webcules/dashboard db:push      # create tables
pnpm --filter @webcules/dashboard dev          # http://localhost:4400
```

First visit creates the single admin account (email + password). After that it's a normal sign-in.

## How it connects to the forge engine

1. `/forge-redesign https://business.ca` (ZCode command) → audits + rebuilds + writes `webcules/<slug>/research/gtm.json`
2. **Forge import** page here → Scan → Import — the business lands in the pipeline as `redesigned` with grades, findings and the quote attached
3. **Lead detail → Outreach** — email / WhatsApp / follow-up drafts generated from the audit, copy or "open in mail app", then *Mark as sent* (starts the follow-up clock shown on Overview)
4. **Lead detail → Payments** — Stripe checkout link (one-time or $10/mo subscription) or record an Interac e-Transfer; a recorded one-time payment flips the lead to **Won** automatically. Installment deals (max 6 months): record each monthly payment as it arrives
5. Domain switches to their name → move the card to **Live**, start the care plan

## Stripe (optional, but do it before your first card-paying client)

1. `STRIPE_SECRET_KEY` in `.env.local` (test key first: `sk_test_…`)
2. Forward webhooks locally: `stripe listen --forward-to localhost:4400/api/stripe/webhook` → put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`
3. Handled events: `checkout.session.completed` (marks payments paid, creates subscriptions), `customer.subscription.updated/deleted`, `invoice.payment_succeeded` (logs monthly renewals)

Without Stripe keys everything still works in manual mode — e-Transfer payments are recorded by hand, which is how most Saskatoon small businesses pay anyway.

## Layout

| Path | Purpose |
|---|---|
| `src/app/(dash)/*` | pages — overview, pipeline kanban, leads, lead detail, pricing, forge, payments |
| `src/app/actions.ts` | all server mutations (auth-guarded) |
| `src/db/schema.ts` | better-auth tables + leads/projects/outreach/payments/subscriptions |
| `src/lib/pricing.ts` | the pricing model — keep in sync with `docs/PRICING.md` |
| `src/lib/forge.ts` | scans `FORGE_ROOT` for `gtm.json` manifests |
| `src/lib/outreach.ts` | pitch/follow-up draft generators (mirror of `/forge-outreach`) |
| `src/app/api/stripe/*` | checkout + webhook |
| `data/dashboard.db` | SQLite file (swap `DATABASE_URL` to a Turso URL to go hosted) |

## Notes

- Amounts are stored in **cents**, displayed as CAD.
- The DB is a local file — back up `data/dashboard.db` or move to Turso when you want it online.
- Restart `pnpm dev` after editing `.env.local`.
