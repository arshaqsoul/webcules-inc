# Snap growth system

An agent pipeline that finds real photographer pain points, checks whether Snap solves them, builds what is missing properly, records realistic demos, and packages reels for the founder to post.
Goal: **10 paid users in 30 days** from the `snap.webcules` Instagram account.

Start with these, in order:

1. `growth/AGENTS.md` - the law every agent follows.
2. `growth/ARCHITECTURE.md` - how it fits together.
3. `growth/DEMO-STANDARD.md` - how demos are recorded and enhanced.

## One-time setup

```bash
cp growth/.env.example growth/.env.local      # then fill in the staging account
node --test growth/scripts/ledger.test.mjs growth/scripts/hooks.test.mjs
```

`growth/.env.local` is gitignored.
Never commit credentials.

## Run it

Mode A, one orchestrator that fans out workers:

```bash
claude --agent growth-orchestrator
```

Mode B, a pool of independent sessions, one per role:

```bash
claude --agent growth-developer      # in a terminal each
claude --agent growth-recorder
```

Each session loops: `ledger.mjs next --role <role>`, `claim`, work, `transition`.

## Everyday commands

```bash
node growth/scripts/ledger.mjs status
node growth/scripts/ledger.mjs list [--state VALIDATED]
node growth/scripts/ledger.mjs next --role developer
node growth/scripts/ledger.mjs show PP-001
node growth/scripts/ledger.mjs block PP-001 --by orchestrator --reason "needs founder decision"
node growth/scripts/ledger.mjs snapshot       # committable backup of the ledger
node growth/scripts/lock.mjs status staging
```

## The founder's part

| When | What |
|---|---|
| A reel reaches PACKAGED | Review it, post it on Instagram yourself, then run the HUMAN_POSTED transition from `package.md` |
| Production deploys | Run them yourself after staging is verified |
| ADR with an exception, a paid vendor, or an unbacked claim | Decide, the record is blocked until you do |
| The first three reels | Approve the look |

## Status of the build

| Piece | State |
|---|---|
| Law, roles, skills, hooks, schemas | done |
| Ledger and lock CLIs with tests | done |
| Performer, recorder, editor, QC scripts | done, smoke-tested end to end against staging |
| Pilot pain point through the whole pipeline | in progress |
| Linear connection | not connected in the session that built this, drafts go to `linear-outbox/` |
| Agent pool | starts after the pilot reel passes QC |

## Layout

```
.claude/agents/growth-*.md      role definitions (real subagents)
.claude/skills/growth-*/        repeatable procedures
.claude/settings.json           hooks: block production deploys, force pushes, state edits, secrets
growth/AGENTS.md                the law
growth/ARCHITECTURE.md          design
growth/DEMO-STANDARD.md         capture and edit standard
growth/schemas/                 ledger and events schemas
growth/templates/               epic, ADR, storyboard, trend, cluster, reel package
growth/scripts/                 ledger.mjs, lock.mjs, hooks, tests
growth/clusters/ adr/ storyboards/ trends/ linear-outbox/ packages/   committed artifacts
growth/state/ locks/ recordings/ out/                                  gitignored runtime
```
