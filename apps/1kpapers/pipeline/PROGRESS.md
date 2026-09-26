# Summary generation progress

SCOPE (user decision): fresh GLM Flash content for ONE chunk only (chunk-01, 30 papers).
The catalog therefore contains 30 papers. Extra generated chunks are held in
`pipeline/out-reserve/` (chunk-02, chunk-06) — move them into `pipeline/out/`
and re-run `pnpm data:build && pnpm build` to grow the catalog.

## State

- Generated + merged: chunk-01 (30 papers, summaries + GLM Flash topic fallback)
- Held in reserve: chunk-02, chunk-06 (not in catalog per scope)
- Not generated: chunks 03–05, 07–34 (chunk inputs ready in pipeline/chunks/)
- Jev pass: NOT run yet — needs AIG_GATEWAY_NAME + CF_AIG_TOKEN (see PROCESS.md)

## Validation checklist per chunk

- count == input count
- every slug matches input order/set
- primaryTopic ∈ taxonomy (pipeline/source/taxonomy.json)
- summary length 400–1,400 chars; markdown paragraph + "- **" bullets
- build-storage.mjs enforces all of the above and fails loudly

