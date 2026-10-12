# Snap E2E

Playwright against a real workerd preview: `server.mjs` runs `vinext build`,
resets an isolated local D1 (`tests/e2e/.state`), applies migrations, seeds,
starts a Cloudflare/DoH mock on :3117, then boots `wrangler dev` on :3000.
Nothing touches the dev database, Turnstile or real Cloudflare APIs.

```
pnpm test:e2e                      # whole suite (from apps/snap)
pnpm test:e2e -- signup-onboarding # one spec
```

CI: `.github/workflows/snap-e2e.yml` runs `signup-onboarding` on PRs touching
`apps/snap/**` or `packages/**` (ubuntu-latest, no secrets; artifacts uploaded
on failure).

## E2E on Windows (WEB-62)

The two old symptoms — "`/signup` never hydrates" and "workerd
crash-loops / binds :3000 but never answers" — were **our harness and spec,
not vinext or workerd**. Verified on Windows 11, Node 24, vinext 1.0.0,
Playwright 1.54.1, wrangler dev on the production build.

| Symptom | Real cause | Fix |
| --- | --- | --- |
| Signup button "does nothing", no console errors | The form's `Your name` input is `required`; the spec never filled it, so the browser silently blocks submit. Page hydrates fine. | Spec fills `Your name`. |
| After fixing that: red "Invalid origin" | `wrangler dev` rewrites Host/Origin to the first `routes` entry (`snaphq.app`), and better-auth rejects it. | `server.mjs` deletes `routes` from `dist/server/wrangler.json` (E2E copy only). |
| Requests hang right after "ready", tests time out on `page.goto` | `global-setup.mjs` ran `taskkill /F /IM workerd.exe`. Playwright starts the webServer **before** globalSetup, so it killed the live workerd; wrangler's :3000 listener stayed bound but nothing answered. | Orphan cleanup moved to the top of `server.mjs`, before our own workerd exists. |

Practical notes:

- A killed run can leave `node`/`workerd` holding :3000 / :3117 ("is already
  used"). Kill them: `taskkill /F /IM workerd.exe`, then the node process
  listening on those ports (`netstat -ano | findstr :3117`).
- Never let anything kill `workerd.exe` while a run is in progress.
- `dist/server/.dev.vars` is swapped for an E2E copy and restored on exit;
  a leftover `.dev.vars.e2e-backup` self-heals on the next run.
- No upstream issue: nothing here is a vinext or workerd bug.
