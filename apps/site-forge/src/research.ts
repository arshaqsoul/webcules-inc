import fs from "node:fs";
import path from "node:path";
import { downloadTo, fetchWithTimeout, flagStr, human, log, resolveProject, UA, type Args } from "./util.ts";

/** Reference-gallery sources for the UI research phase. JS-heavy sources degrade gracefully —
 *  the playbook then falls back to agent-side browsing (WebFetch / image search). */
type Source = { key: string; label: string; urlFor: (query: string) => string };

const SOURCES: Source[] = [
  { key: "motionsites", label: "motionsites.ai", urlFor: () => "https://motionsites.ai/" },
  { key: "refero", label: "refero.design", urlFor: (q) => `https://refero.design/search?q=${encodeURIComponent(q)}` },
  { key: "recent", label: "recent.design", urlFor: () => "https://recent.design/websites" },
];

const IMG_RE = /(?:https?:)?\/\/[^\s"'<>)\\]+?\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>)\\]*)?/gi;
const BAD_RE = /(avatar|icon|logo|favicon|sprite|emoji|flag|16x16|32x32|48x48|\.svg|placeholder|blank|1x1)/i;
const GOOD_RE = /(screen|shot|cover|preview|card|hero|image|img|media|photo|shot_|_shot|full)/i;

function absolutize(u: string, base: string): string | null {
  try {
    if (u.startsWith("//")) return "https:" + u;
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

function extractImages(html: string, base: string): string[] {
  const found = new Map<string, number>();
  for (const m of html.matchAll(IMG_RE)) {
    const abs = absolutize(m[0], base);
    if (!abs || BAD_RE.test(abs)) continue;
    let score = 0;
    if (GOOD_RE.test(abs)) score += 2;
    if (/\/(uploads|cdn|images|assets|img)\//i.test(abs)) score += 1;
    if (!found.has(abs) || found.get(abs)! < score) found.set(abs, score);
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

function extractLinks(html: string, base: string): string[] {
  const host = new URL(base).hostname.replace(/^www\./, "");
  const out = new Set<string>();
  for (const m of html.matchAll(/href="([^"#]+)"/g)) {
    const abs = absolutize(m[1]!, base);
    if (!abs || !abs.includes(host)) continue;
    if (/\.(css|js|png|jpe?g|svg|webp|ico|xml|json)(\?|$)/i.test(abs)) continue;
    out.add(abs.split("?")[0]!);
  }
  return [...out].slice(0, 25);
}

export async function cmdResearch(args: Args) {
  const query = args.positional.join(" ").trim();
  if (!query) { console.log("usage: forge research \"fintech landing, dark luxury\" [--project <name>] [--count 6] [--url <extra-page>]"); return; }
  const projectRef = flagStr(args, "project", "p");
  const projectDir = resolveProject(projectRef);
  const outDir = projectDir ? path.join(projectDir, "research") : path.resolve("research");
  const refsDir = path.join(outDir, "refs");
  fs.mkdirSync(refsDir, { recursive: true });
  const perSource = Number(flagStr(args, "count", "n") ?? 6);

  const targets = [...SOURCES.map((s) => ({ ...s, url: s.urlFor(query), extra: false }))];
  const extraUrl = flagStr(args, "url");
  if (extraUrl) targets.push({ key: "extra", label: extraUrl, url: extraUrl, extra: true } as any);

  const brief: string[] = [
    `# Design brief — ${query}`,
    ``,
    `> Generated ${new Date().toISOString()} by \`forge research\`. Fill every section before building.`,
    ``,
    `## Reference images (research/refs/)`,
    ``,
  ];
  let totalSaved = 0;

  for (const t of targets) {
    let html = "";
    try {
      const r = await fetchWithTimeout(t.url, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000, redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      html = await r.text();
    } catch (e: any) {
      log.warn(`${t.label}: fetch failed (${e.message}) — skipping`);
      continue;
    }
    const imgs = extractImages(html, t.url);
    const links = extractLinks(html, t.url);
    if (!imgs.length) {
      log.warn(`${t.label}: no images in HTML (likely JS-rendered) — browse it manually and add screenshots here`);
      continue;
    }
    brief.push(`### ${t.label} — ${t.url}`);
    if (links.length) brief.push(`\nPages worth opening: ${links.slice(0, 12).map((l) => `<${l}>`).join(" · ")}\n`);
    let saved = 0;
    for (const u of imgs) {
      if (saved >= perSource) break;
      const ext = (u.split("?")[0]!.match(/\.(png|jpe?g|webp|avif)$/i)?.[1] ?? "jpg").toLowerCase();
      const dest = path.join(refsDir, `${t.key}-${saved + 1}.${ext}`);
      try {
        const bytes = await downloadTo(u, dest);
        if (bytes < 15000) { fs.rmSync(dest); continue; } // skip tiny leftovers
        saved++; totalSaved++;
      } catch { /* skip broken */ }
    }
    log.ok(`${t.label}: saved ${saved} reference${saved === 1 ? "" : "s"}`);
  }

  brief.push(
    ``,
    `## Design language (fill in after reviewing refs)`,
    `- Layout patterns to steal:`,
    `- Typography (display / body, scale, casing):`,
    `- Color system (bg, fg, accent, gradients):`,
    `- Motion vocabulary (hovers, scrolls, reveals):`,
    ``,
    `## What makes these feel $10k`,
    `-`,
    ``,
    `## What to avoid`,
    `-`,
    ``,
    `## Chosen direction (1–2 sentences + which refs)`,
    `-`,
    ``
  );

  const briefPath = path.join(outDir, "design-brief.md");
  const existing = fs.existsSync(briefPath);
  if (existing && !args.flags.force) {
    log.warn(`design-brief.md already exists — leaving it (use --force to overwrite; refs were still saved)`);
  } else {
    fs.writeFileSync(briefPath, brief.join("\n"));
    log.ok(`brief → ${briefPath}`);
  }
  log.info(`${totalSaved} references in ${refsDir}`);
  if (totalSaved === 0) {
    log.warn(`no references fetched — sources may be JS-rendered or offline. Fallback: browse the three sources in a browser, screenshot 5–10 layouts into refs/, and fill the brief manually.`);
  }
}
