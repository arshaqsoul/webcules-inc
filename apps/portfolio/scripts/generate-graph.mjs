#!/usr/bin/env node
/**
 * Generate public/graph-data.json from the Arshaq KB vault (Obsidian-style).
 *
 * Usage:  node scripts/generate-graph.mjs [--kb /path/to/Arshaq KB]
 * Fallbacks: ARSHAQ_KB_PATH env var, then ~/Documents/CVs/Arshaq KB.
 *
 * Public-safe transforms:
 *  - Excludes the private "Positioning" folder (job-search system) entirely.
 *  - Drops any line linking to a private note or mentioning resumes.
 *  - Drops internal-only sections (Do not claim / Sources / Navigate / Framing).
 *  - Applies a small per-note patch list where a whole line would otherwise be
 *    lost to the line filters (rewrites it into its public-safe form).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argKb = process.argv.includes('--kb') ? process.argv[process.argv.indexOf('--kb') + 1] : null;
const VAULT = path.resolve(
  argKb || process.env.ARSHAQ_KB_PATH || path.join(os.homedir(), 'Documents', 'CVs', 'Arshaq KB')
);
const OUT = new URL('../public/graph-data.json', import.meta.url).pathname;

const PRIVATE_TITLES = [
  'Resume Recipes', 'Metrics Bank', 'Accuracy Guardrails',
  'Interview Story Bank', '2026 Applications', 'Headlines & Target Roles',
];
const DROP_SECTIONS = [
  'Do not claim', 'Sources', 'Navigate the graph',
  'Framing decisions to keep consistent', 'Job search system',
];

const FOLDER_COLORS = {
  Roles: '#6366f1', // indigo-500
  Projects: '#0ea5e9', // sky-500
  Skills: '#8b5cf6', // violet-500
  Domains: '#94a3b8', // slate-400
  Tech: '#94a3b8', // slate-400
};
const HUB_COLOR = '#4f46e5'; // indigo-600
const NARRATIVE_COLOR = '#64748b'; // slate-500

// Targeted rewrites so useful lines survive the generic scrubbing.
const PATCHES = {
  'Arshaq Hisham': [
    [
      /^- Education:.*$/m,
      '- Education: MSc Advanced Software Engineering, University of Westminster (UK). BSc Business Information Technology, Staffordshire University, 2015.',
    ],
  ],
  'Villvay Systems': [
    [
      /^Product Owner, Colombo, Sri Lanka.*$/m,
      'Product Owner, Colombo, Sri Lanka.',
    ],
  ],
  'AI & LLM Engineering': [
    [
      /^- Retrieval bridge:.*$/m,
      '- Retrieval bridge: the search relevance work (ELSER, RRF) is retrieval engineering — half of RAG — and semantic recall over a vector store covers the other half.',
    ],
  ],
  'AI App Generator': [
    [/\(repo: webcules-projects\/init\), /, ''],
    [
      /^- Clerk to Better Auth.*$/m,
      '- Clerk to Better Auth, Prisma to Drizzle, Inngest to Mastra, billing to Polar — each swap chosen deliberately, with a trade-off story to tell.',
    ],
  ],
  'ELUX Travels': [
    [
      /^- Payments:.*$/m,
      '- Payments: full, deposit and installment plans with proof-of-payment upload and manual verification — bank transfer by design, gateway-ready schema.',
    ],
  ],
  'AI Oncology Capstone': [
    [
      /^AI-assisted breast cancer.*$/m,
      'AI-assisted breast cancer early-detection and diagnostics module designed for the COSMIC EHR in the Sri Lankan context, done in the Cambio context.',
    ],
  ],
};

function listMarkdownFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(e.parentPath ?? e.path, e.name))
    .filter((p) => !p.split(path.sep).some((seg) => seg.startsWith('.')))
    .filter((p) => path.dirname(p) !== path.resolve(dir, 'Positioning'));
}

function cleanBody(title, raw) {
  let body = raw.replace(/^---\n.*?\n---\n?/s, '');
  for (const [pattern, replacement] of PATCHES[title] || []) {
    body = body.replace(pattern, replacement);
  }
  // Drop lines that link to private notes, mention resumes, or expose phone numbers.
  const privateRe = new RegExp(
    PRIVATE_TITLES.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  );
  const isHeading = (line) => /^#{1,3} /.test(line);
  const dropSectionRe = new RegExp(`^## (?:${DROP_SECTIONS.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);

  const lines = [];
  let dropping = false;
  for (const line of body.split('\n')) {
    if (isHeading(line)) dropping = dropSectionRe.test(line);
    if (!dropping && !privateRe.test(line) && !/resume|résumé/i.test(line) && !/^- Phone:/i.test(line)) {
      lines.push(line);
    }
  }
  // Remove headings left with no content before the next heading.
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeading(line) && line.startsWith('##')) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length || isHeading(lines[j])) continue;
    }
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildNotes() {
  const notes = [];
  for (const file of listMarkdownFiles(VAULT)) {
    const rel = path.relative(VAULT, file);
    const folder = path.dirname(rel) === '.' ? '' : path.basename(path.dirname(rel));
    const title = path.basename(rel, '.md');
    const raw = fs.readFileSync(file, 'utf8');
    const body = cleanBody(title, raw);
    const linkTitles = [...new Set([...body.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()))];
    notes.push({
      id: rel.replace(/\.md$/, ''),
      title,
      folder,
      color:
        title === 'Arshaq Hisham' ? HUB_COLOR
        : title === 'Career Arc' ? NARRATIVE_COLOR
        : FOLDER_COLORS[folder] || '#8a8a8a',
      text: body.slice(0, 6000),
      linkTitles,
    });
  }
  return notes;
}

function wireLinks(notes) {
  const byTitle = new Map();
  for (const n of notes) if (!byTitle.has(n.title)) byTitle.set(n.title, n);
  const links = [];
  for (const n of notes) {
    for (const t of n.linkTitles) {
      const m = byTitle.get(t);
      if (m && m.id !== n.id) links.push([notes.indexOf(n), notes.indexOf(m)]);
    }
    delete n.linkTitles;
  }
  return links;
}

const notes = buildNotes();
const links = wireLinks(notes);
const payload = { generated: new Date().toISOString().slice(0, 10), notes, links };
fs.writeFileSync(OUT, JSON.stringify(payload).replace(/</g, '\\u003c'));
console.log(`graph-data.json written: ${notes.length} notes, ${links.length} links, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
