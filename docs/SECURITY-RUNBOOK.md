# Security runbook — Snap (WEB-202)

The standing security doc for Snap: the verified checklist, the dependency-audit
procedure, the header/cookie policy, the secret-rotation runbook, and the
pen-test-style self-assessment. Scoped to Snap's reachable dependency graph
(`--importer=apps/snap`); the workspace-wide audit is dominated by Payload CMS
apps that belong to other products and are tracked separately.

## Checklist (WEB-202) — status and evidence

- [x] **Baseline response headers on every response.**
  `apps/snap/lib/security-headers.ts` (applied in `proxy.ts`): nosniff,
  `Referrer-Policy: strict-origin-when-cross-origin`, restrictive
  `Permissions-Policy`, HSTS `max-age=31536000` on https.
  Evidence: `tests/unit/security-headers.test.ts` — 12 assertions green.
- [x] **Framing protection with an explicit embed carve-out.**
  App pages get `CSP: frame-ancestors 'self'; base-uri 'self'; object-src 'none'`
  + `X-Frame-Options: SAMEORIGIN`. `/embed/*` and `/ts*` are framed
  cross-origin by design and set their own per-studio `frame-ancestors` CSP in
  their routes (`app/embed/calendar/route.ts`, `app/embed/contact/route.ts`,
  `app/ts/route.ts`) — the proxy must not clobber it (middleware headers
  overwrite route headers in vinext), so those paths receive everything except
  the CSP/XFO. Evidence: unit tests `ownsFrameAncestors` cases; code refs above.
- [x] **Session cookie flags.** Verified live on staging
  (`https://staging.snaphq.app`, same auth code as prod):
  `__Secure-better-auth.session_token=…; Max-Age=2592000; Path=/; HttpOnly;
  Secure; SameSite=Lax`. Prod re-verified after the header deploy ships.
- [x] **Dependency audit + lockfile hygiene.** See next section; tool checked
  in as `tools/audit-lockfile.mjs`, vulnerable deps forced via pnpm overrides.
- [x] **Secret rotation runbook.** Section below, grounded in
  `scripts/deploy.mjs` `REQUIRED_SECRETS` (the deploy preflight refuses a
  worker missing any of them).
- [x] **Pen-test-style self-assessment.** Section below.
- [ ] **Prod header verification incl. embed surfaces (post-deploy).**
  Pre-deploy baseline (2026-10-12): `https://snap.webcules.com/` serves none
  of CSP/HSTS/XFO/Referrer-Policy/Permissions-Policy — the fix in this branch
  closes that. After Thor deploys, re-run:
  `curl -sID - https://snap.webcules.com/ | grep -iE 'security|frame|transport|referrer|permissions'`
  plus one live `/embed/*` studio URL and `/ts`, and confirm the per-studio
  `frame-ancestors` survives with the baseline headers alongside. Then check
  this box and record the SHA.

## Dependency audit + lockfile hygiene

`pnpm audit` (10.4) targets a retired npm endpoint and hangs; use the checked-in
bulk-advisory tool instead:

```bash
node tools/audit-lockfile.mjs --importer=apps/snap --prod   # runtime graph, fails on high+
node tools/audit-lockfile.mjs --importer=apps/snap          # incl. dev graph
node tools/audit-lockfile.mjs                               # whole workspace
```

Results after this pass (2026-10-12, 449 prod / 490 total packages scanned):

- Fixed via `pnpm.overrides` in the root `package.json` (re-run
  `pnpm install --no-frozen-lockfile`, then the audit tool):
  `immutable@^4.3.9`, `yaml@^2.8.3`, `fflate@^0.7.5` (prior stragglers),
  `undici@<7.29.1 → ^7.29.1` (WS-subprotocol DoS, TLS bypass, cookie
  disclosure), `sharp@<0.35.5 → ^0.35.5` (librsvg CVE-2026-96889),
  `picomatch@2 → 2.3.2` (ReDoS).
- **Accepted, no patched release exists** — re-check on the next audit pass:
  - `braces@3.0.3` (high, GHSA-vfj7-8cjw-p6xm): every published version is
    vulnerable; build/dev-time globbing only, not in the deployed worker.
    Override the moment a fixed version ships.
  - `esbuild ≤0.24.2` advisory (moderate, GHSA-67mh-4wv8-2f99): dev-server
    exposure; dev-only, mitigated by not binding the dev server to a public
    interface.
- Playwright pinned `1.54.1 → 1.64.0`, `next` recorded explicitly
  (`^16.3.8`) in `apps/snap/package.json`.
- Gates recorded for this pass: `pnpm typecheck` green (after
  `npx wrangler types` regenerates the gitignored
  `worker-configuration.d.ts`), `vitest run` 99 files / 1194 tests green.

## Header audit details

| Surface | CSP | XFO | HSTS | nosniff | Referrer-Policy | Permissions-Policy |
|---|---|---|---|---|---|---|
| App pages (`/`, `/dashboard/*`, …) | frame-ancestors 'self' + base-uri/object-src | SAMEORIGIN | ✓ (https) | ✓ | ✓ | ✓ |
| `/embed/*`, `/ts*` (framed by design) | per-studio `frame-ancestors` from the route | — (would break framing) | ✓ | ✓ | ✓ | ✓ |
| Redirects (307 → /login etc.) | same as target class | ✓ | ✓ | ✓ | ✓ | ✓ |

HSTS is set only on https so local http dev is unaffected. No `includeSubDomains`
yet — the custom-hostname studio domains (`*.snaphq.app` and customer domains)
share the zone; revisit after confirming no plain-http subdomain is still used.

## Secret rotation runbook

Secrets live as Worker secrets (`cf workers secrets`), checked by the deploy
preflight (`scripts/deploy.mjs → REQUIRED_SECRETS`). Rotate with
`cf workers secrets update <NAME> --worker <snap-staging|snap-production>
--type secret_text --text <value>`, staging first, then production. Rotating
anything in the "invalidate sessions" row signs users out — do it in a quiet
window and say so on the status page.

| Secret | Compromise impact | Rotation steps / blast radius |
|---|---|---|
| `BETTER_AUTH_SECRET` | Session forgery for every account | Generate new 32+ byte value; update on staging, verify sign-in/2FA, then prod. **Invalidates all sessions** (everyone re-logs; 2FA unaffected — TOTP secrets are separate). |
| `STRIPE_SECRET_KEY` | Charge/refund API access | Roll in Stripe dashboard (Developers → API keys → restrict old key), update secret, run a test checkout + Connect flow. Webhook signatures unaffected. |
| `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhook spoofing | Endpoint secret rolls with the Stripe endpoint (resend endpoint URL in dashboard → new secret); update Worker secret before old events expire. Brief window of rejected signatures — monitor `stripe webhook` errors. |
| `SNAP_INBOUND_WEBHOOK_SECRET` | Forged inbound email/lead webhooks | Rotate issuer-side and Worker-side together; brief inbound-webhook rejection window. |
| `TURNSTILE_SECRET_KEY` | Bypass of bot checks on public forms | Roll in Cloudflare dashboard (Turnstile → widget → rotate secret); pair with `TURNSTILE_SITE_KEY` var. Forms fail closed during the gap. |
| `R2_S3_ACCESS_KEY_ID` / `R2_S3_SECRET_ACCESS_KEY` | Read/write all gallery + RAW storage | Create new R2 API token (scoped to the bucket), update both secrets, then delete old token. No user impact if sequenced. |
| `CLOUDFLARE_API_TOKEN` (prod deploy) | Deploy/zone control | Roll in CF dashboard → API tokens; used by deploy pipeline only. |

Post-rotation: `node scripts/deploy.mjs staging` (preflight asserts all
secrets present), verify per AGENTS.md, then production.

## Pen-test-style self-assessment (2026-10-12)

What this pass checked and found:

- **Clickjacking**: fixed by the baseline CSP/XFO; embed surfaces intentionally
  frameable but pin `frame-ancestors` to the specific studio origin (and
  `/ts` pins its `postMessage` target origin). Verified by unit tests; live
  prod check pending deploy (open checklist item).
- **Session/token handling**: cookies carry `__Secure-` prefix + HttpOnly +
  Secure + SameSite=Lax (verified live); 2FA secrets and backup codes stored
  encrypted; password reset and 2FA enable revoke sessions; code verification
  rate-limited (facts from `lib/docs/content/security.tsx`, verified against
  `lib/auth.server.ts` / migration 0053).
- **Dependency supply chain**: prod graph clean of high+ except `braces`
  (no fix published, dev-only exposure — accepted and monitored).
- **MIME sniffing / referrer leakage / powerful features**: covered by
  nosniff, strict-origin-when-cross-origin, and the Permissions-Policy
  lockdown (camera/mic/geo/payment/usb off, interest-cohort off).
- **Known gaps / follow-ups**: (1) prod header verification after deploy
  (open checklist item above); (2) HSTS `includeSubDomains` decision pending
  subdomain survey; (3) no full-script CSP (`script-src`) yet — Snap ships
  inline vinext/runtime scripts, so a nonce/hash pass is a separate piece of
  work, propose as its own issue; (4) `braces` override the day a patched
  release ships.
