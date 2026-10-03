---
name: growth-qa-verify
description: Procedure for independently verifying a growth feature - typecheck, tests, and a logged-in staging browser pass with pixel-level UI scrutiny - and reporting defects without fixing them. Use when QA handles REVIEWED or QA_PASSED records.
---

# QA verification

## 1. Automated checks

In your own worktree on the PR branch:

```
pnpm typecheck
pnpm --filter snap test          # unit and integration
pnpm --filter snap test:e2e      # relevant specs under tests/e2e/specs
```

Report every failure, including ones that predate the branch.
The founder's standard is that red lint, tests and flakiness get fixed, so file or flag them.

## 2. Staging pass

1. Acquire the lock: `node growth/scripts/lock.mjs acquire staging --by qa-PP-### --wait 600`.
2. Confirm staging runs this branch's commit (the deploy script prints it).
3. Log in at `https://snap-staging.webcules.com` with the staging account.
   Use the project's e2e login helper or the founder's session.
   Do not type a password into a Chrome-tool session.
4. Walk every acceptance criterion from the epic.

## 3. What to look at

| Area | Check |
|---|---|
| Happy path | each acceptance criterion works end to end |
| States | empty, loading, error, partial, limit reached |
| Tiers | Free sees the upgrade prompt, the correct paid tier gets the feature, enforcement holds when the UI is bypassed |
| Tenancy | data from another organization never appears |
| Responsive | phone width and desktop width |
| UI detail | alignment, spacing, clipped or wrapped text, focus rings, contrast, copy tone, consistency with neighbouring screens |
| Docs | the docs page exists and matches the real behavior |
| Cost | no unbounded loop or per-view model call |

Take a screenshot of every defect.

## 4. Report

Pass:

```
ledger.mjs transition PP-### QA_PASSED --by qa --set qa='{"verdict":"pass","typecheck":"pass","tests":"pass","e2e":"pass"}'
ledger.mjs transition PP-### STAGING_VERIFIED --by qa --set qa.staging_commit=<sha> --set qa.staging_verified_at=<iso time>
```

Fail:

```
ledger.mjs rework PP-### ARCHITECTED --by qa --note "1) <steps to reproduce, expected, actual, screenshot path> 2) ..."
```

Release the staging lock either way.

## Rules

- Verification means a logged-in render, never a curl 200.
- Do not edit product code or tests.
- Do not touch production.
- Verify the exact commit that will ship.
