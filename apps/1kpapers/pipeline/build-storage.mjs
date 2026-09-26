// Builds public/storage/ — the static JSON + artwork layout the site consumes.
// Mirrors the original project's object-storage bucket layout:
//   catalog.json, homepage.json, most-cited.json, most-starred.json,
//   search-index.json, papers/{id}/summary.json, papers/{id}/cover.png,
//   topics/{slug}/art.png
//
// Inputs:
//   pipeline/source/metadata-papers.json  (factual corpus, MIT-licensed 1kpapers)
//   pipeline/source/taxonomy.json         (24 collections / 8 sections)
//   pipeline/out/chunk-*.json             (generated summaries + classifications)
// Scope: only papers with a generated summary enter the catalog. Generating
// more chunks into pipeline/out/ grows the catalog automatically.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, "pipeline", "source");
const outDir = path.join(root, "pipeline", "out");
const storageDir = path.join(root, "public", "storage");

const TOPIC_SLUGS = new Set(JSON.parse(fs.readFileSync(path.join(sourceDir, "taxonomy.json"), "utf8")).topics.map((t) => t.slug));

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function hashString(str) {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const ACCENT_PALETTES = {
  blue: [[36, 64, 143], [56, 189, 248], [13, 20, 38]],
  cyan: [[8, 84, 102], [103, 232, 249], [4, 18, 26]],
  magenta: [[112, 26, 84], [244, 114, 182], [26, 6, 20]],
  yellow: [[124, 78, 8], [250, 204, 21], [24, 16, 2]],
  green: [[16, 82, 56], [110, 231, 183], [4, 20, 14]],
  orange: [[124, 45, 18], [251, 146, 60], [26, 10, 4]],
  red: [[127, 29, 29], [252, 165, 165], [28, 6, 6]],
  purple: [[76, 29, 149], [196, 181, 253], [16, 6, 30]],
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeArt({ slug, accent, width, height }) {
  const h = hashString(slug);
  const [c1, c2, dark] = ACCENT_PALETTES[accent] ?? ACCENT_PALETTES.blue;
  const angle = ((h % 360) / 360) * Math.PI * 2;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const diag = Math.abs(width * cosA) + Math.abs(height * sinA);
  const glowX = width * (0.2 + ((h >>> 8) % 60) / 100);
  const glowY = height * (0.15 + ((h >>> 16) % 50) / 100);
  const glowR = Math.max(width, height) * 0.75;
  const rgba = Buffer.alloc(width * height * 4);
  let p = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = Math.min(1, Math.max(0, (x * cosA + y * sinA + diag / 2) / diag));
      const gd = Math.hypot(x - glowX, y - glowY) / glowR;
      const glow = Math.max(0, 1 - gd * gd) * 0.55;
      // subtle diagonal texture bands
      const band = ((Math.sin((x + y) * 0.02 + (h % 17)) + 1) / 2) * 0.06;
      const r = lerp(lerp(dark[0], c1[0], t), c2[0], glow) + band * 40 * t;
      const g = lerp(lerp(dark[1], c1[1], t), c2[1], glow) + band * 40 * t;
      const b = lerp(lerp(dark[2], c1[2], t), c2[2], glow) + band * 40 * t;
      rgba[p++] = Math.min(255, Math.round(r));
      rgba[p++] = Math.min(255, Math.round(g));
      rgba[p++] = Math.min(255, Math.round(b));
      rgba[p++] = 255;
    }
  }
  return encodePNG(width, height, rgba);
}

// ------------------------------------------------------------------- inputs
const metadata = JSON.parse(fs.readFileSync(path.join(sourceDir, "metadata-papers.json"), "utf8"));
const metaBySlug = new Map(metadata.papers.map((p) => [p.slug, p]));

const generated = [];
const chunkFiles = fs.readdirSync(outDir).filter((f) => /^chunk-\d+\.json$/.test(f)).sort();
for (const file of chunkFiles) {
  const rows = JSON.parse(fs.readFileSync(path.join(outDir, file), "utf8"));
  for (const row of rows) generated.push(row);
}

// Jev classification (pipeline/classify-jev.mjs) overrides the GLM Flash
// fallback assignment when a result exists for a paper.
const jevPath = path.join(outDir, "jev-classification.json");
let jevCount = 0;
if (fs.existsSync(jevPath)) {
  const jev = JSON.parse(fs.readFileSync(jevPath, "utf8"));
  const bySlug = new Map(jev.results.map((r) => [r.slug, r]));
  for (const row of generated) {
    const decision = bySlug.get(row.slug);
    if (!decision?.primaryTopic) continue;
    row.primaryTopic = decision.primaryTopic;
    row.secondaryTopic = decision.secondaryTopic ?? null;
    row.confidence = decision.confidence ?? row.confidence;
    jevCount += 1;
  }
}

// -------------------------------------------------------------- validation
const problems = [];
const seenSlugs = new Set();
for (const row of generated) {
  if (seenSlugs.has(row.slug)) problems.push(`duplicate slug ${row.slug}`);
  seenSlugs.add(row.slug);
  const meta = metaBySlug.get(row.slug);
  if (!meta) problems.push(`unknown slug ${row.slug}`);
  if (!TOPIC_SLUGS.has(row.primaryTopic)) problems.push(`${row.slug}: bad primaryTopic ${row.primaryTopic}`);
  if (row.secondaryTopic !== null && row.secondaryTopic !== undefined && !TOPIC_SLUGS.has(row.secondaryTopic)) {
    problems.push(`${row.slug}: bad secondaryTopic ${row.secondaryTopic}`);
  }
  const len = (row.summary ?? "").length;
  if (len < 400 || len > 1400) problems.push(`${row.slug}: summary length ${len}`);
  if (!row.summary.includes("- **")) problems.push(`${row.slug}: missing bullet formatting`);
}
const missingMeta = [];
void missingMeta;
if (problems.length) {
  console.error(`VALIDATION FAILED (${problems.length} problems):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

// ------------------------------------------------------------- paper objects
const papers = [];
for (const row of generated) {
  const m = metaBySlug.get(row.slug);
  const editorialTopics = [row.primaryTopic, row.secondaryTopic].filter(Boolean);
  const paper = {
    id: m.collectionId ?? (m.arxivId ? `arxiv-${m.arxivId}` : m.slug),
    slug: m.slug,
    arxivId: m.arxivId ?? null,
    title: m.title,
    authors: m.authors ?? [],
    abstract: m.abstract ?? null,
    publishedAt: m.publishedAt,
    landingUrl: m.landingUrl ?? (m.arxivId ? `https://arxiv.org/abs/${m.arxivId}` : null),
    pdfUrl: m.pdfUrl ?? (m.arxivId ? `https://arxiv.org/pdf/${m.arxivId}` : null),
    pageCount: m.pageCount ?? null,
    topics: [],
    editorialTopics,
    primaryTopic: row.primaryTopic,
    categories: m.arxivCategories ?? [],
    upvotes: m.hfUpvotes ?? null,
    summary: row.summary,
    lab: m.officialLab ?? null,
    citations: m.citationCount ?? null,
    githubRepository: m.githubRepository ?? null,
    githubStars: m.githubStars ?? null,
    projectPage: m.projectPage ?? null,
    doi: m.arxivDoi ?? m.doi ?? null,
    venue: m.venue ?? null,
    license: m.licenseName ?? null,
  };
  papers.push({ paper, meta: m, confidence: row.confidence ?? null });
}

papers.sort((a, b) => new Date(b.paper.publishedAt) - new Date(a.paper.publishedAt));
const generatedAt = new Date().toISOString();

const listingFields = [
  "id", "slug", "title", "authors", "publishedAt", "landingUrl",
  "topics", "editorialTopics", "primaryTopic", "upvotes", "summary",
  "lab", "citations", "githubRepository", "githubStars", "venue",
];
const asListing = (p) => Object.fromEntries(listingFields.map((k) => [k, p.paper[k]]));
const listings = papers.map(asListing);

// -------------------------------------------------------------- rankings
const byCitations = [...papers].sort((a, b) => (b.paper.citations ?? -1) - (a.paper.citations ?? -1));
const byStars = papers.filter((p) => p.paper.githubStars != null).sort((a, b) => b.paper.githubStars - a.paper.githubStars);
const byUpvotes = [...papers].sort((a, b) => (b.paper.upvotes ?? -1) - (a.paper.upvotes ?? -1));

const monthCounts = {};
const topicCounts = {};
for (const p of papers) {
  const monthKey = p.paper.publishedAt.slice(0, 7);
  monthCounts[monthKey] = (monthCounts[monthKey] ?? 0) + 1;
  topicCounts[p.paper.primaryTopic] = (topicCounts[p.paper.primaryTopic] ?? 0) + 1;
}

// ------------------------------------------------------------------ write
fs.rmSync(storageDir, { recursive: true, force: true });
fs.mkdirSync(storageDir, { recursive: true });
fs.mkdirSync(path.join(storageDir, "papers"), { recursive: true });
fs.mkdirSync(path.join(storageDir, "topics"), { recursive: true });

const writeJSON = (rel, value) => {
  const file = path.join(storageDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

writeJSON("catalog.json", { schemaVersion: 2, generatedAt, papers: listings });
writeJSON("homepage.json", {
  schemaVersion: 2,
  generatedAt,
  trending: byUpvotes.slice(0, 100).map(asListing),
  mostCited: byCitations.slice(0, 100).map(asListing),
  monthCounts,
  topicCounts,
});
writeJSON("most-cited.json", { schemaVersion: 2, generatedAt, papers: byCitations.slice(0, 100).map(asListing), paperCount: papers.length });
writeJSON("most-starred.json", { schemaVersion: 2, generatedAt, papers: byStars.slice(0, 100).map(asListing), paperCount: papers.length });
writeJSON("search-index.json", {
  papers: papers.map((p) => ({
    id: p.paper.id,
    slug: p.paper.slug,
    title: p.paper.title,
    authors: p.paper.authors.slice(0, 6),
    lab: p.paper.lab,
    topics: p.paper.editorialTopics,
    publishedAt: p.paper.publishedAt,
  })),
});

// per-paper summary.json with related papers (same primary topic first)
for (const p of papers) {
  const sameTopic = papers.filter((o) => o !== p && o.paper.primaryTopic === p.paper.primaryTopic).slice(0, 3);
  const related = sameTopic.length ? sameTopic : byCitations.filter((o) => o !== p).slice(0, 3);
  writeJSON(`papers/${p.paper.id}/summary.json`, { paper: p.paper, relatedPapers: related.map(asListing) });
}

// topic + section artwork
const taxonomy = JSON.parse(fs.readFileSync(path.join(sourceDir, "taxonomy.json"), "utf8"));
for (const topic of taxonomy.topics) {
  const file = path.join(storageDir, "topics", `${topic.slug}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, makeArt({ slug: topic.slug, accent: topic.accent, width: 1200, height: 900 }));
}
for (const section of taxonomy.sections) {
  const file = path.join(storageDir, "topics", `${section.artworkSlug}.png`);
  fs.writeFileSync(file, makeArt({ slug: section.artworkSlug, accent: section.accent, width: 1200, height: 900 }));
}

// covers for papers referenced by lib/paper-artwork.ts
const PAPER_ARTWORK_IDS = [
  "arxiv-2512.02556", "arxiv-2602.02276", "arxiv-2511.21631", "arxiv-2508.10104",
  "arxiv-2511.16719", "arxiv-2602.15763", "arxiv-2510.18234", "arxiv-2607.24653", "arxiv-2509.04664",
];
const catalogIds = new Set(papers.map((p) => p.paper.id));
for (const id of PAPER_ARTWORK_IDS) {
  if (!catalogIds.has(id)) continue;
  const file = path.join(storageDir, "papers", id, "cover.png");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, makeArt({ slug: id, accent: "magenta", width: 1672, height: 941 }));
}

console.log(`storage built: ${papers.length} papers, chunks: ${chunkFiles.join(", ")}, jev-assigned: ${jevCount}`);
console.log(`months: ${Object.keys(monthCounts).length}, topics used: ${Object.keys(topicCounts).length}`);
