---
name: growth-tier-mapping
description: Procedure for deciding from code whether Snap solves a pain point, on which tier, and whether it is a gap. Use when mapping VALIDATED records to a solved, partial or gap verdict.
---

# Tier mapping

## Sources of truth, in order

1. Behavior in staging, logged in: what a photographer can actually do.
2. `apps/snap/lib/plans-data.ts`: enforced limits and tier gates.
3. `apps/snap/lib/tier-cards.ts` and the landing pricing grid: what we advertise.
4. Code under `apps/snap/app`, `components`, `lib`: what exists.
5. `apps/snap/lib/docs/`: what we documented.
6. `docs/SNAP-FREE-TIER.md` and `docs/SNAP-COMPETITIVE-ANALYSIS.md`: intent and context only.

If two sources disagree, behavior wins, and the disagreement is recorded in the notes as a product bug.

## Procedure

1. Restate the pain point as the job the photographer needs done.
2. List the steps a photographer would take to do that job in Snap today.
3. For each step, find the code and exercise it in staging.
   Note the route and the file.
4. Decide the verdict:

| Verdict | Rule |
|---|---|
| solved | every step works end to end today |
| partial | some steps work, one or more are missing or broken |
| gap | no meaningful path exists |

5. Find the lowest tier that can do the job, using `plans-data.ts`.
   Set `paid_tier_trigger` to true when that tier is not Free, because those are the pain points that convert.
6. Record it:

```
node growth/scripts/ledger.mjs transition PP-### TIER_MAPPED --by mapper --set tier_mapping='{
  "verdict":"solved","tier":"lite","paid_tier_trigger":true,
  "surfaces":["apps/snap/lib/plans-data.ts","/dashboard/galleries"],
  "notes":"What works, what does not, and how you checked."}'
```

## Rules

- Cite only paths and routes that exist.
- A partial verdict lists exactly what is missing, so the architect starts from facts.
- Never mark solved from the docs alone.
- If the flow is broken, that is a partial, and also a bug note.
- Do not edit product code.
