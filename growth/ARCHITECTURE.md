# Growth system architecture

This document explains how the pieces fit.
The rules agents must follow are in `growth/AGENTS.md`.

## Shape

```
                       +---------------------------+
                       |       orchestrator        |
                       |  (main session or pool)   |
                       +-------------+-------------+
                                     | ledger.mjs next / claim / transition
        +----------+----------+------+-----+----------+----------+
        |          |          |            |          |          |
   researcher   mapper    architect    developer   reviewer     qa
        |          |          |            |          |          |
        v          v          v            v          v          v
  +-----------------------------------------------------------------+
  |  LEDGER  growth/state/pain-points/PP-###.json  (gitignored)     |
  |  + committed artifacts: clusters, ADRs, storyboards, trends     |
  +-----------------------------------------------------------------+
        ^          ^          ^            ^          ^
   designer    recorder    editor      packager    analyst
                                           |
                                           v
                              growth/packages/PP-###/  ->  FOUNDER POSTS
```

## Why a ledger and not a chat chain

Chat handoffs drift.
A ledger record carries its own evidence, its history, and the paths of every artifact produced.
The CLI guards make a step impossible to skip, and a restart of any agent loses nothing.

The ledger is stored outside git, in the main checkout, because agents work in separate git worktrees on separate branches.
If it lived in git, every feature branch would carry a different copy.
`ledger.mjs snapshot` writes a committable copy for backup.

## Two ways to run the pool

**Mode A - one orchestrator session.**
Start with `claude --agent growth-orchestrator`.
It reads the ledger, picks work by score, and fans out worker subagents in parallel.
Developers run with worktree isolation.
This is the default.

**Mode B - independent sessions.**
Open one terminal per role, for example `claude --agent growth-developer`.
Each session runs the loop `next --role X`, `claim`, work, `transition`.
Leases keep them from colliding.
Use this to scale a bottleneck role, such as two recorders.

Subagents cannot spawn subagents, so only the orchestrator (when it is the main session) dispatches.

## The two tracks

**Solved track.**
The mapper finds that Snap already handles the pain point, on a named tier, and cites the code.
The record skips straight to demo design.
These pain points are the fastest posts, and the ones on paid tiers are the most valuable for the 10-user goal.

**Build track.**
The mapper finds a gap or partial coverage.
The architect clusters it with related gaps, files an epic, and writes an ADR.
The developer builds it on a branch, the reviewer and QA gate it, and it is verified on staging.
Only then does the record enter the demo track.
A demo never shows something that is not real.

## Prioritisation

`score = severity x 2 + frequency + 4 if a paid tier is the trigger`.
The goal is paid users, so pain points that Lite, Studio or Pro solve rank above Free-tier wins.
The orchestrator may override with an explicit `priority`.

## Linear

Issues live in the Snap project (team key `WEB`).
The architect searches before creating, files epics with dependent children, and records ids in the ledger.
If the Linear connection is unavailable, the architect writes the full draft to `growth/linear-outbox/` and the record proceeds with `linear.outbox`.
A later session files outbox drafts and swaps the path for real ids.
Without a connection, no agent may invent an issue id.

## Concurrency and shared resources

| Resource | Protection |
|---|---|
| a pain point record | lease (`claim`) plus per-record write lock |
| staging worker, D1, R2 | `lock.mjs staging` |
| git tree | one worktree and one branch per feature |
| production | hook-blocked for growth agents; the founder deploys, or directs an interactive session to |
| Instagram | read-only in Chrome, human writes |

## Failure handling

- A failed review or QA run uses `rework` with a written reason, and the developer picks it up again.
- A QC failure on a recording sends the record back to RECORDED or ENHANCED, depending on whether the cause is the take or the edit.
- An agent that crashes mid-work leaves a lease that expires on its own (45 minutes by default).
- `block` is for decisions only a human can make, such as an ambiguous claim or a paid-API cost.

## Extensibility rule

The whole point of the architect role is that capability number two is cheap.
Examples of platform layers the architect should produce rather than one-off features:

- An inference layer (model gateway, queue, result store) before any AI feature.
- A media-processing pipeline before any per-photo analysis.
- A notification layer before any new email or reminder type.

Every ADR lists the extension point and the next two features it should make easy.

## Phases

1. **Foundation (done in the first commit):** law, roles, skills, hooks, schemas, ledger and lock CLIs, tests.
2. **Capture tooling (built):** `growth/scripts/record` (performer, recorder), `growth/scripts/edit` (browser-composited editor, because this ffmpeg has no drawtext), `growth/scripts/qc`, plus one pilot pain point taken all the way to a real reel.
3. **Pool:** start the orchestrator once the pilot passes QC and the founder approves the look.
