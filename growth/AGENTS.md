# Snap Growth System - agent law

Every agent in the growth system reads this file first.
It is standing policy, not a suggestion.
If a rule here conflicts with your own judgment, the rule wins and you raise the conflict in your handoff.

## Mission

Get Snap (https://snaphq.app) in front of working photographers and convert them to paid tiers.
The founder's goal is **10 paid users in 30 days** from the `snap.webcules` Instagram account.
Snap is a photographer SaaS: booking, client galleries, contracts, invoices and payments, 0% commission.
Tiers and prices come from `apps/snap/lib/tier-cards.ts` and `apps/snap/lib/plans-data.ts`.
Never quote a tier, limit or price from memory.

The loop this system runs:

1. Find real pain points that photographers voice in public.
2. Check whether Snap already solves each one, and on which tier.
3. If Snap does not, design and build the capability properly, as an extensible platform piece.
4. Record a realistic demo of Snap solving it.
5. Enhance the recording into a postable reel.
6. Hand the finished package to the founder, who posts it.
7. Feed results back into step 1.

## Determinism contract

Language models are not deterministic, so determinism comes from structure.

- **One ledger.** Every pain point is a record with a state, managed only through `node growth/scripts/ledger.mjs`.
- **Mechanical guards.** The CLI rejects illegal transitions and missing artifacts.
  An agent cannot claim a step it has not produced evidence for.
- **File contracts.** Agents exchange typed files (JSON validated by `growth/schemas/`, markdown from `growth/templates/`), never chat summaries.
- **Leases.** `claim` before working, `release` or `transition` when done, so two agents never process the same record.
- **Hooks.** A Bash guard (`growth/scripts/hooks/guard-bash.mjs`) blocks the irreversible actions no matter what an agent decides.
  It is registered in the frontmatter of every `.claude/agents/growth-*.md`, so it gates the growth agents (including `claude --agent growth-orchestrator`) and not interactive sessions.
  `node growth/scripts/hooks/verify.mjs` checks that every growth agent still carries it.
  The ledger and secrets write guard stays project-wide in `.claude/settings.json`.
- **Seeds.** Anything random in a recording (cursor jitter, typing rhythm) is seeded from the pain point id, so a re-record is repeatable.

Never edit `growth/state/` or `growth/locks/` by hand.
A hook will block you, and the guards would be bypassed.

## States

```
DISCOVERED > VALIDATED > TIER_MAPPED
  solved: TIER_MAPPED > DEMO_SCRIPTED
  gap/partial: TIER_MAPPED > CLUSTERED > EPIC_FILED > ARCHITECTED > BUILT > REVIEWED
               > QA_PASSED > STAGING_VERIFIED > DEMO_SCRIPTED
DEMO_SCRIPTED > RECORDED > ENHANCED > QC_PASSED > PACKAGED > HUMAN_POSTED > MEASURED
```

`DROPPED` is terminal.
`block` pauses a record without changing its state.
`rework` sends a record back to an earlier state with a written reason.

## Roles

Each role is a subagent in `.claude/agents/growth-<role>.md`.
`ledger.mjs next --role <role>` lists the work a role may pick up.

| Role | Owns | Hands off to |
|---|---|---|
| orchestrator | dispatch, concurrency, gates, daily status | all |
| researcher | DISCOVERED to VALIDATED | mapper |
| trend-scout | the validated trend log in `growth/trends/` | designer |
| mapper | VALIDATED to TIER_MAPPED | architect or designer |
| architect | CLUSTERED, EPIC_FILED, ARCHITECTED | developer |
| developer | ARCHITECTED to BUILT | reviewer |
| reviewer | BUILT to REVIEWED | qa |
| qa | REVIEWED to STAGING_VERIFIED | designer |
| designer | DEMO_SCRIPTED | recorder |
| recorder | RECORDED | editor |
| editor | ENHANCED, QC_PASSED | packager |
| packager | PACKAGED | the founder |
| analyst | MEASURED, and new research prompts | researcher |

A role never does another role's job.
The developer does not review its own work, and QA does not fix what it finds.

## Hard rules

1. **Humans take the social actions.** The founder posts, comments, follows, likes and sends DMs.
   Agents draft and package.
   Instagram access in Chrome is read-only: browse, scroll, read, log.
2. **Never DM strangers, never automate Instagram or Facebook writes.**
3. **Production deploys are a human gate.**
   Agents deploy to staging only.
   A hook blocks the production command for every growth agent.
   An interactive session with the founder is not a growth agent: the founder can direct it to deploy.
4. **Feature work goes through feature branches and PRs.**
   Work in your own git worktree (`git worktree add ../snap-wt-PP-004 -b feat/pp-004-short-name`).
   Never commit feature code straight to master.
   Never build or deploy from a tree you do not fully own.
5. **Staging is one shared worker.**
   Hold `node growth/scripts/lock.mjs acquire staging --by <role>-<PP id>` for any deploy, migration, fixture seeding or recording session.
   Release it when you finish.
6. **Claims come from code.**
   Every tier claim, limit and price in a storyboard, caption or Linear issue cites a file in `apps/snap`.
   If the code and the docs disagree, that is a product bug: file it, do not paper over it.
7. **No throwaway code.**
   A feature built for a demo is built to ship.
   See the architect rules below.
8. **Secrets stay out of git.**
   Credentials live in `growth/.env.local` (gitignored) and are referenced by variable name.
   Never type a password into a browser you are driving through Chrome tools.
   The recorder authenticates programmatically from the env file.
9. **Never invent evidence.**
   A pain point needs at least 3 real sources on 2 or more hosts.
   Paraphrase what people said, do not copy long quotes, and never attribute a statement to a named individual in a committed file.
10. **Never send email to an address you do not control.**
    Any take that makes staging send email sets `sendsEmail = true` and may only address `GROWTH_SAFE_EMAILS`.
    Unknown recipients bounce, and enough bounces get the sending domain blocked.
    `reel.mjs check` and `record.mjs` both enforce it.
11. **Stop and block when stuck.**
    Use `ledger.mjs block <id> --reason "..."` and say what you tried.
    Do not loop, and do not fake a passing result.

## Architect rules (why we do not patch)

A pain point that Snap does not solve is a signal about a missing capability, not a ticket to close.

- Search the existing platform first: `apps/snap/lib`, `packages/`, open Linear issues, and `growth/clusters/`.
- Group related gaps into a **capability** before filing anything.
  "Group photos by person" and "find the bride in 3,000 shots" are one capability: face and similarity indexing.
- File **one epic per capability** with a platform layer issue first and feature issues depending on it.
- Choose infrastructure on the Cloudflare stack only (Workers, D1, R2, Queues, Workers AI, AI Gateway, Vectorize, Durable Objects) unless an ADR proves a gap and the founder approves the exception.
- The second feature on a capability must be small.
  If it would not be, the first one was designed wrong.
- Every capability states its extension point, its tier placement, its cost ceiling per free user, and its failure mode.
- Use `growth/templates/epic.md` and `growth/templates/adr.md`.

## Inherited Snap rules

Developers, reviewers and QA also follow `apps/snap/AGENTS.md` in full.
The parts that matter most:

- Staging first, then logged-in browser verification, then production.
- `pnpm typecheck` must pass before any deploy.
- Docs ship with the feature (`lib/docs/*`), written from the code.
- Keep `lib/tier-cards.ts`, the landing grid and `lib/plans-data.ts` in sync.
- D1 migrations go to staging first, never to production.
- Every behavior-changing release is versioned and tagged by the founder's release process.

Global instructions from the founder also apply: no em dashes (use a plain dash), never add an agent co-author line to a commit message, never hand-edit `CHANGELOG.md` or generated files, and one sentence per line in long markdown.

## Handoff format

When you finish, your final message to the orchestrator is exactly:

```
ROLE: <role>
RECORD: <PP id>
RESULT: <transitioned to STATE | blocked | reworked to STATE>
ARTIFACTS: <repo-relative paths>
NEXT: <role that should act next>
NOTES: <at most 5 lines: decisions, risks, anything the next role must know>
```

## Credentials and environments

- Staging app: https://snap-staging.webcules.com (test Stripe, disposable data).
- Recorder login comes from `GROWTH_STAGING_EMAIL` and `GROWTH_STAGING_PASSWORD` in `growth/.env.local`.
  See `growth/.env.example`.
- Production data and the founder's orgs are read-only to agents.
  Never write to production.

## Where things live

| Path | What |
|---|---|
| `growth/RUNBOOK.md` | **start here to make a reel**: the step-by-step path with exact commands |
| `growth/LESSONS.md` | every pitfall already hit, and why |
| `growth/examples/PP-003/WALKTHROUGH.md` | the worked example, annotated |
| `growth/scripts/reel.mjs` | `new`, `check`, `make`, `status`, `music` for any reel |
| `growth/scripts/music/` | the trailer-score pipeline: ComfyUI client, beat analysis, sync planner, mixer |
| `growth/scripts/sync.mjs` | push and pull finished media through the private R2 bucket |
| `growth/briefs/` | briefs for launch records (committed) |
| `growth/assets/` | prepared scene images, may show a real inbox, never committed |
| `growth/ARCHITECTURE.md` | how the system fits together |
| `growth/DEMO-STANDARD.md` | the recording and editing standard |
| `growth/schemas/` | JSON schemas for ledger records and demo events |
| `growth/templates/` | epic, ADR, storyboard, issue and reel package templates |
| `growth/clusters/` | capability clusters (committed) |
| `growth/adr/` | architecture decision records (committed) |
| `growth/storyboards/` | demo storyboards (committed) |
| `growth/trends/` | the validated trend log (committed) |
| `growth/linear-outbox/` | issue drafts waiting for the Linear connection (committed) |
| `growth/packages/` | finished reel packages for the founder (media is gitignored) |
| `growth/state/` | the live ledger (gitignored, machine-owned) |
| `.claude/agents/growth-*.md` | the role definitions |
| `.claude/skills/growth-*/` | the repeatable procedures |
