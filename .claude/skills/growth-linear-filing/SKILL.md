---
name: growth-linear-filing
description: Procedure for filing well-structured epics and dependent issues in the Snap project in Linear, with duplicate search and an outbox fallback when the Linear connection is unavailable. Use when the architect files work.
---

# Linear filing

## Find the tools

Linear is reached through an MCP connection.
Search the deferred tool list for "linear" (ToolSearch) and load what you need.
If no Linear tools exist in this session, use the outbox, described below.
Never invent an issue id.

## Where

The Snap project, team key `WEB` (issue ids look like `WEB-216`).
Confirm the team and project by listing them before you create anything.

## Search before creating

Search by capability keywords, not only by the exact title.
If a matching issue exists:

- open and fits: link the cluster to it and extend its description,
- closed: reference it and explain what changed,
- partly overlapping: file a child that states the boundary.

## Structure

Always an epic with children.

```
Epic: <capability name>                      label: growth, capability
  Platform: <reusable layer>                 label: platform        (first, no dependencies)
  Feature: <user-facing behavior #1>         depends on Platform
  Feature: <user-facing behavior #2>         depends on Platform
  Docs and tier placement                    can ride with the feature issues
```

Each issue contains:

- **Context**: the pain point in plain language, citing ledger ids (PP-###) and never named individuals.
- **Scope**: what is in and what is out.
- **Acceptance criteria**: testable bullets.
- **Design link**: `growth/adr/ADR-###.md` and the epic file.
- **Tier and limits**: the tier, server-side enforcement, and the free-tier cost ceiling.
- **Test plan**: unit, e2e on staging, failure modes.
- **Out of scope / follow-ups**: the next features this layer enables.

Use `growth/templates/epic.md` for the epic body.

## Record

Put the epic id in the ledger:

```
node growth/scripts/ledger.mjs transition PP-### EPIC_FILED --by architect --set linear.epic=WEB-### --set linear.issues='["WEB-###","WEB-###"]'
```

## Outbox fallback

When Linear is not reachable:

1. Write each draft as `growth/linear-outbox/<cluster-id>-<n>-<slug>.md` with the full issue text and a header line naming its parent and dependencies.
2. Record `--set linear.outbox=growth/linear-outbox/<cluster-id>-0-epic.md`.
3. Tell the orchestrator that outbox drafts need filing once the connection returns.
   A later session files them, replaces `linear.outbox` with real ids, and moves the drafts to `growth/linear-outbox/filed/`.

## Rules

- One epic per capability, never a lone ticket for a symptom.
- Titles are outcomes, for example "Group a gallery's photos by person", not "AI thing".
- Do not assign people or set priorities beyond what the cluster justifies.
- Do not paste secrets, credentials or long quotes from the public.
