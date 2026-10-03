# Epic: <capability name>

Cluster: CL-###
Pain points: PP-###, PP-###
Linear: <epic id, or "outbox">
Tier placement: free | lite | studio | pro (with the reason)

## Problem and evidence

<Plain language. Cite the ledger records, not named individuals.>

## Capability

<What the platform gains. Written so a second feature could reuse it.>

## Architecture summary

<Three to ten lines. The full reasoning lives in the ADR: growth/adr/ADR-###.md.>

## Platform layer (build first)

| Issue | Scope | Depends on |
|---|---|---|
| WEB-### | <infrastructure and interfaces, no user-facing UI> | none |

## Feature issues (build on the layer)

| Issue | Scope | Depends on |
|---|---|---|
| WEB-### | <user-facing behaviour> | platform layer |

## Extension points

<Where the next feature plugs in, and what it would cost to add it.>

## Cost and limits

<Cost ceiling per free user and per paid user. Rate limits. Quotas. What happens at the limit.>

## Tier, billing and docs

- `lib/plans-data.ts` and `lib/tier-cards.ts` changes:
- Docs pages to add or update in `lib/docs/`:
- Upgrade prompt copy (photographer-facing, never client-facing):

## Test plan

- Unit:
- E2E on staging (logged in):
- Failure modes exercised:

## Rollout

<Flags, migrations (staging first), backfill, rollback.>

## Definition of done

- [ ] Platform layer merged and verified on staging
- [ ] Feature merged and verified on staging
- [ ] Docs written from the code
- [ ] Tier placement enforced server-side
- [ ] Demo storyboard unblocked
