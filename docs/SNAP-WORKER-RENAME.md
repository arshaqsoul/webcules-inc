# Snap worker rename runbook (WEB-331)

Renames the Snap Workers and makes snaphq.app the only way in.

| Old | New |
| --- | --- |
| `webcules-snap` | `snap` |
| `webcules-snap-staging` | `snap-staging` |
| `webcules-snap-email` | `snap-email` |

D1 and R2 names (`webcules-snap`, `snap-webcules`, `snap-staging`) do not change.

## Why this is a runbook

Cloudflare has no Worker rename.
A rename creates a new Worker and moves everything to it.
Secrets cannot be read or copied between Workers, so every secret is set again on the new Worker.
A custom domain can be attached to one Worker at a time, so each domain moves with a short gap.
The new Workers are uploaded first without any routes (`--no-routes`), so secrets are in place before any traffic moves.

## Secrets to set on the new Workers

| Worker | Secrets |
| --- | --- |
| `snap` | `BETTER_AUTH_SECRET`, `CLOUDFLARE_API_TOKEN`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY`, `SNAP_INBOUND_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY` |
| `snap-staging` | `BETTER_AUTH_SECRET`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY`, `SNAP_INBOUND_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `snap-email` | `SNAP_INBOUND_WEBHOOK_SECRET` |

Command shape (one per secret):

```
cf workers secrets update <NAME> --worker <worker> --type secret_text --text '<value>'
```

Notes on the values:

- `SNAP_INBOUND_WEBHOOK_SECRET` must be identical on `snap` and `snap-email` (and on `snap-staging` for its own manual cron).
  Any new long random string works, as long as both sides match.
- `BETTER_AUTH_SECRET` can be reused to keep everyone signed in.
  A new value signs everyone out once.
- Live Stripe values (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are set by the founder only.
- `STRIPE_WEBHOOK_SECRET` is the signing secret of the existing webhook endpoint, so reuse the same value.
- `CLOUDFLARE_API_TOKEN` must keep Custom Hostnames edit on the snaphq.app zone.
- The R2 S3 keys and `TURNSTILE_SECRET_KEY` are unchanged values, re-entered.

## Order

### 1. Staging

1. From the rename branch, run the staging deploy with `--no-routes` to upload `snap-staging` with no routes.
2. Set the 6 staging secrets on `snap-staging`.
3. Run the staging deploy again without `--no-routes` to attach `staging.snaphq.app` and `snap-staging.webcules.com` to the new Worker.
   Wrangler asks to take the domains over from `webcules-snap-staging`, answer yes.
4. Verify signed in: login, upload, gallery link, booking, a Stripe test checkout.
5. Delete the old `webcules-snap-staging` Worker after a day.

### 2. Inbound email worker

1. `cd apps/snap-email && npx wrangler deploy` creates `snap-email` (cron 06:00 UTC, no domains).
2. Set `SNAP_INBOUND_WEBHOOK_SECRET` on `snap-email` (same value as `snap`).
3. Repoint the Email Routing rules on the snaphq.app zone from `webcules-snap-email` to `snap-email`:
   hello@, support@, and the catch-all (noreply@ stays a drop rule).
4. Send a test to `hello+no-such-studio@snaphq.app` and confirm the ops forward arrives.
5. Delete the old `webcules-snap-email` Worker after a day.
6. Delete the legacy `snap.webcules.com` Email Routing rules and its sending subdomain.

### 3. Production

1. Founder runs the production deploy with `--staging-verified --no-routes` to upload `snap` with no routes.
2. Set the 8 production secrets on `snap` (live Stripe ones by the founder).
3. Founder runs the production deploy with `--staging-verified` to move `snaphq.app`, `www.snaphq.app`, `snap.webcules.com` and the `domains.snaphq.app/*` route to the new Worker.
   The deploy script then re-creates the per-hostname custom-domain routes with `script: "snap"`.
   Expect a few seconds of gap while each domain moves.
4. Verify both hosts, the Stripe webhook (unsigned POST returns 400), the `www` redirect and a signed-in smoke test.
5. Keep `webcules-snap` for at least a week as a fallback, then delete it.

## Rollback

Until the old Worker is deleted, deploy the previous master (old Worker name) to move the domains back.
Old Workers keep their own secrets, so they come back working.

## Things that change with the new names

- `lib/cf-hostnames.ts` and `scripts/deploy.mjs` create per-hostname routes for script `snap`.
- The repo guard hook (`growth/scripts/hooks/guard-bash.mjs`) matches the old production Worker names.
  The founder updates it to the new names.
- `workers_dev` and `preview_urls` are off, so `*.workers.dev` URLs stop serving.
