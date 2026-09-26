# Process — how this site was built

A rebuild of [1kpapers.com](https://www.1kpapers.com) ("The Year in AI Papers"),
following the same three-stage pipeline as the original, with GLM Flash as the
writer and Jev as the classifier. The original project is open source under the
MIT license ([Nutlope/1kpapers](https://github.com/Nutlope/1kpapers)); this
rebuild reuses its factual corpus and site structure under that license and
regenerates all editorial content from source material.

## How the original did it

Studied from the original repo's `research/` notes, `README`, and result files:

1. **Corpus.** 8,262 discovery candidates from Hugging Face Daily Papers plus
   verified research from five frontier labs, deduplicated by canonical arXiv
   ID, every version-pinned PDF checked (SHA-256), frozen at exactly 1,018
   papers published Aug 4 2025 – Aug 4 2026.
2. **Summarization benchmark.** 30,681 PDF pages were text-extracted
   (102.7M characters) and sent to DeepSeek V4 Flash, GPT-5.6 Luna, and Claude
   Haiku 4.5 under an identical summary contract (map/reduce fallback for
   oversized papers, reasoning disabled). Headline: $3.99 total for DeepSeek
   V4 Flash, ~$0.004 per paper.
3. **Jev classification.** TypeSafe AI's System One model (Jev) classified the
   1,018 summarized papers into 24 editorial collections for $0.08 total
   (~396 input / 1 output tokens per decision) — cheap typed decisions instead
   of generative classification. Topic taxonomy was derived from k-means
   clustering experiments (k=16/20/24/30, settled on 24 collections across 8
   sections).
4. **Metadata.** GitHub stars, Hugging Face upvotes, Semantic Scholar /
   OpenAlex citations, DOIs, venues — snapshotted into
   `metadata/papers.json`.
5. **Site.** Next.js app reading prebuilt JSON + artwork from object storage.

## How this rebuild redoes it

| Stage | Original | This rebuild |
| --- | --- | --- |
| Corpus | Built from arXiv + HF + lab seeds | Reused the frozen factual corpus (MIT) |
| Summaries | DeepSeek V4 Flash / GPT-5.6 Luna / Claude Haiku 4.5 over extracted PDF text | **GLM Flash** writes a fresh summary per paper from the arXiv abstract under the same format contract |
| Classification | Jev into 24 collections | **Jev via Cloudflare AI Gateway** (`pipeline/classify-jev.mjs`), GLM Flash fallback until the gateway is configured |
| Metadata | GitHub / HF / Semantic Scholar snapshots | Same factual snapshots from the corpus |
| Site | Next.js + object storage | Same Next.js app, storage layout served locally from `public/storage/` |

### Content provenance

- Paper metadata (titles, authors, abstracts, dates, links, stats) is factual
  data from the corpus.
- **Summaries are newly written** by GLM Flash — never copied from the
  original site — following the original's contract: one opening paragraph,
  2–4 bolded bullet facts, 650–1,150 characters, no numbers absent from the
  abstract.
- Topic assignments follow the original 24-collection taxonomy; the primary
  assignment currently comes from GLM Flash and is replaced by Jev decisions
  when the gateway pass runs.
- All site copy (homepage, process section, llms.txt) is original to this
  rebuild.

## Pipeline commands

```bash
pnpm data:build          # merge corpus + generated content → public/storage/
pnpm build               # data:build + next build
node pipeline/classify-jev.mjs   # Jev pass through the Cloudflare AI Gateway
```

### Running the Jev pass

```bash
AIG_GATEWAY_NAME=<gateway-name> \
CF_AIG_TOKEN=<gateway-token> \
node pipeline/classify-jev.mjs
node pipeline/build-storage.mjs && pnpm build
```

`classify-jev.mjs` sends each paper (title + abstract + summary as `state`)
to `POST {gateway}/typesafe/v1/systemone` with three typed questions:
`primaryTopic` (Choice over the 24 collections), `secondaryTopic` (optional
Choice), and `confidence` (Score). Results land in
`pipeline/out/jev-classification.json` and the storage build prefers them
automatically.

### Scaling to the full 1,018-paper corpus

The corpus is split into 34 chunks of 30 papers under `pipeline/chunks/`.
Chunk 01 is generated (per scope decision); 29 more papers of generated
content sit unused in `pipeline/out-reserve/` (chunk 02 + 06). To grow the
catalog: generate more `out/chunk-NN.json` files (same contract, prompts in
git history) and re-run `pnpm data:build && pnpm build` — pages, rankings,
counts, and the sitemap all derive from the catalog automatically.

## Layout

```
pipeline/
  chunks/chunk-NN.json    input papers (factual fields only)
  out/chunk-NN.json       generated summaries + classifications
  out-reserve/            generated chunks held back from the catalog
  out/jev-classification.json   Jev decisions (when the pass has run)
  source/                 frozen inputs: corpus, metadata, taxonomy
  build-storage.mjs       corpus + content → public/storage/
  classify-jev.mjs        Jev classification via Cloudflare AI Gateway
public/storage/           generated static data + artwork
app/, components/, lib/   Next.js site (adapted from the MIT original)
```
