---
name: growth-feature-architecture
description: Procedure for turning product gaps into extensible capabilities - clustering, platform-first design, model research, and an ADR on the Cloudflare stack. Use when an architect handles a partial or gap record.
---

# Feature architecture

The goal is that the next feature on the same capability is a small change.

## 1. Search first

Look for what already exists before designing:

- `apps/snap/lib` and `packages/` for helpers, queues, storage and AI code.
- `growth/clusters/` and `growth/adr/` for earlier decisions.
- Linear for open or closed issues on the same topic.
- Cloudflare product docs for a primitive that already does it.

If an existing capability almost fits, extend it and say so.

## 2. Cluster

Write the capability, not the feature.
Ask: what is the root cause shared by several pain points?
Example: "group photos by person", "find the bride in 3,000 shots", "cull duplicates" all need an image analysis layer and a per-gallery index.
Create or update `growth/clusters/CL-###.md`.

## 3. Platform layer first

Separate the reusable layer from the feature on top of it.

| Layer | Examples |
|---|---|
| Platform | a model gateway, a job queue and result store, a vector index per organization, a media pipeline |
| Feature | the screens and endpoints a photographer uses |

The platform issue has no user-facing UI and has its own tests and docs for engineers.

## 4. Choose on the Cloudflare stack

| Need | Default |
|---|---|
| request handling | Workers |
| relational data | D1, every row keyed by organization id |
| files and derivatives | R2 ($0 egress) |
| async and batch work | Queues, with retries and a dead-letter path |
| per-tenant coordination | Durable Objects |
| embeddings and similarity | Vectorize |
| model inference | Workers AI, or AI Gateway in front of an external provider when quality needs it |

Anything outside this list needs a recorded exception for the founder.

## 5. Model research (for AI features)

1. List candidate models for the task with size, license, hosting option, and published benchmarks.
2. Test on representative photographer inputs when possible: low light, group shots, RAW previews, different skin tones and ages.
3. Estimate cost per 1,000 operations and per free user per month against the cost model in `docs/SNAP-FREE-TIER.md`.
4. Consider privacy: client faces are sensitive, so state what is stored, for how long, and how it is deleted.
5. Cite every source with the date you read it, because catalogues and prices change.
6. Choose, and say what would make you change your mind.

## 6. Write the ADR

Use `growth/templates/adr.md`.
It must name the extension point and the next two features it should make easy.
It must state limits, quotas, failure modes and the free-tier cost ceiling.

## 7. Define tier placement

Decide the tier from cost and value, not from convenience.
Enforce it on the server, update `plans-data.ts` and `tier-cards.ts`, and keep them in sync.
Upgrade prompts speak to the photographer and never block their client.

## Checklist before ARCHITECTED

- [ ] searched existing code, ADRs and Linear
- [ ] cluster file written
- [ ] platform layer separated from features
- [ ] ADR complete with extension point and cost ceiling
- [ ] privacy and deletion addressed
- [ ] tier placement justified
- [ ] each issue independently buildable and testable
