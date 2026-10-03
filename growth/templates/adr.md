# ADR-###: <decision title>

Date:
Status: proposed | accepted | superseded
Cluster: CL-###
Decided by: architect (founder approval needed only for the exceptions listed below)

## Context

<The capability, the constraints (Cloudflare stack, free-tier cost model in docs/SNAP-FREE-TIER.md), and what exists today.>

## Options considered

| Option | Fit | Cost per 1k operations | Latency | Lock-in | Verdict |
|---|---|---|---|---|---|
| <option A> | | | | | |
| <option B> | | | | | |

For model choices, record the model name, size, license, where it runs (Workers AI, AI Gateway to a provider, or other), and the evidence for its quality on photographer-relevant inputs.
Cite sources and dates.
Prices and model catalogues change, so link to the page and note when you read it.

## Decision

<One paragraph.>

## Architecture

<Components, data flow, storage. A small diagram is welcome.>

| Concern | Choice |
|---|---|
| Compute | |
| Async work | |
| Storage (D1 / R2 / Vectorize / DO) | |
| Auth and tenancy | every row keyed by organization id |
| Rate limits and quotas | |
| Observability | |

## Extension point

<The interface or registry a future feature uses. Show the shape, for example the function signature.>
<List the next two features this should make easy.>

## Consequences

<What gets easier, what gets harder, what we now must maintain.>

## Exceptions requiring founder approval

<Anything outside the Cloudflare stack, any new paid vendor, any change to the free-tier cost model. If none, write "none".>
