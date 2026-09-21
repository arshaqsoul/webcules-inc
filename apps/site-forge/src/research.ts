import fs from "node:fs";
import path from "node:path";
import { downloadTo, fetchWithTimeout, flagStr, log, resolveProject, UA, type Args } from "./util.ts";

/**
 * Reference-gallery sources for the UI research phase. Each source filters differently —
 * these strategies were verified live (Sept 2026):
 *  - awwwards:      ?text=<full query>   server-side full-text search ✅
 *  - uiuxshowcase:  ?s=<one word>       server-rendered WP search, AND-matched → vocab tag
 *                       or first query word only (full multi-word query → no results)
 *  - minimal.gallery: /tag/<word>/       server-rendered tag pages ✅ (real vocab below)
 *  - recent.design: ?category=<word>     server-filtered ✅ (bogus → empty page → fallback)
 *  - darkmodedesign: ?s= is client-side only (returns identical HTML) — homepage list
 *  - motionsites:   JS-rendered gallery — homepage only, few refs
 *  - refero.design: search is a client-side shell — link-only, browse manually
 */
type Source = {
  key: string;
  label: string;
  kind: "search" | "tag" | "list" | "link";
  /** the URL to actually fetch for a query (tag may be undefined → fallback) */
  urlFor: (query: string, tag: string | undefined) => string;
  /** browse URL recorded in the brief */
  home: string;
  prefer?: RegExp;
  avoid?: RegExp;
  upgrade?: (u: string) => string;
  dedupeKey?: (u: string) => string;
  vocab?: string[];
  note?: string;
};

const enc = encodeURIComponent;

const MINIMAL_TAGS = [
  "automotive", "ai", "portfolio", "personal", "startup", "one-page", "agency", "e-commerce", "branding",
  "tools", "fashion", "saas", "finance", "type-foundry", "non-profit-charity", "crypto-web3",
  "architecture-interior-design", "animation", "consulting", "programming", "software", "online-gallery",
  "directory", "food-drink", "museum-gallery", "real-estate", "photography", "entertainment", "product",
  "app", "music", "science", "education", "healthcare", "blog", "production-studio", "research", "pricing",
  "advertising", "art",
];

const RECENT_CATEGORIES = [
  "agency", "portfolio", "startup", "saas", "finance", "fintech", "ecommerce", "fashion", "photography",
  "travel", "food", "restaurant", "health", "fitness", "education", "crypto", "web3", "game", "gaming",
  "music", "sports", "real-estate", "automotive", "technology", "ai", "directory", "blog", "magazine",
  "news", "dashboard", "studio", "app",
];

const UIUX_CATEGORIES = [
  "agency", "animation", "artificial-intelligence", "books-blogs", "branding", "coding", "design-archives",
  "design-films", "design-systems", "ecommerce-ads", "email-inspiration", "figma", "framer", "icons",
  "illustrations", "jobs-freelancing", "landing-page", "learning", "logo-inspiration", "marketing",
  "mindfulness", "mobile-app", "mockups", "portfolio", "productivity", "photography", "tutorials",
  "typography", "ui-design", "ui-research", "industrial-design",
];

const SOURCES: Source[] = [
  {
    key: "awwwards",
    label: "awwwards.com",
    kind: "search",
    home: "https://www.awwwards.com/websites/",
    urlFor: (q) => `https://www.awwwards.com/websites/?text=${enc(q)}`,
    prefer: /awwwards\.com\/awards\/media\/cache\/[^/]+\/submissions\//i,
    upgrade: (u) => u.replace("thumb_440_330", "thumb_880_660"),
    dedupeKey: (u) => u.split("/").pop() ?? u,
  },
  {
    key: "uiux",
    label: "uiuxshowcase.com",
    kind: "tag",
    home: "https://uiuxshowcase.com/",
    // ?s= is a real server-rendered WordPress search, but it ANDs every word — a full
    // multi-word query returns "No results found". Search ONE word: the vocab tag if the
    // query has one, else the query's first meaningful token (any word is searchable).
    urlFor: (q, tag) => {
      const word =
        tag ?? q.toLowerCase().split(/[^a-z0-9]+/).find((t) => t && !STOPWORDS.has(t)) ?? q;
      return `https://uiuxshowcase.com/?s=${enc(word)}`;
    },
    // showcase entries live at /uploads/YYYY/MM/Capitalized-Name(-scaled|-WxH).webp;
    // UI chrome (menu/search/bookmark/category icons) is lowercase — avoided below
    prefer: /\/wp-content\/uploads\/\d{4}\/\d{2}\/[A-Z][^/]*\.(?:webp|jpe?g|png)/,
    avoid: /icon|bookmark|search-|best-of|uiuxshowcase\.com_/i,
    upgrade: (u) => u.replace(/-\d{3,4}x\d{3,4}(\.(?:webp|jpe?g|png))$/i, "-scaled$1"),
    dedupeKey: (u) => u.replace(/-scaled(\.\w+)$/i, "$1").replace(/-\d+x\d+(\.\w+)$/i, "$1"),
    vocab: UIUX_CATEGORIES,
  },
  {
    key: "minimal",
    label: "minimal.gallery",
    kind: "tag",
    home: "https://minimal.gallery/",
    urlFor: (_q, tag) => (tag ? `https://minimal.gallery/tag/${tag}/` : "https://minimal.gallery/"),
    prefer: /\/uploads\//i,
    avoid: /\/themes\/|\/meta\/|mobbin\.gif/i,
    vocab: MINIMAL_TAGS,
  },
  {
    key: "recent",
    label: "recent.design",
    kind: "tag",
    home: "https://recent.design/websites",
    urlFor: (_q, tag) => (tag ? `https://recent.design/websites?category=${enc(tag)}` : "https://recent.design/websites"),
    prefer: /cdn\.recent\.design\/items\//i,
    dedupeKey: (u) => u.match(/items\/([a-z0-9-]+)\//i)?.[1] ?? u,
    vocab: RECENT_CATEGORIES,
  },
  {
    key: "darkmode",
    label: "darkmodedesign.com",
    kind: "list",
    home: "https://www.darkmodedesign.com/",
    urlFor: () => "https://www.darkmodedesign.com/",
    prefer: /-thumbnail\.webp/i,
    note: "?s= search is client-side only — filter by hand on site",
  },
  {
    key: "motionsites",
    label: "motionsites.ai",
    kind: "list",
    home: "https://motionsites.ai/",
    urlFor: () => "https://motionsites.ai/",
    note: "gallery is JS-rendered — browse it in a browser for motion references",
  },
  {
    key: "refero",
    label: "refero.design",
    kind: "link",
    home: "https://refero.design/",
    urlFor: (q) => `https://refero.design/search?q=${enc(q)}`,
    note: "search results are client-side rendered — open in browser and screenshot manually",
  },
];

// vibe words that never name a category
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "site", "sites", "website", "websites", "web", "landing",
  "page", "pages", "ui", "ux", "design", "designs", "designed", "best", "top", "modern", "premium", "style",
  "styled", "creative", "clean", "beautiful", "high", "quality", "company", "business", "build", "builder",
  "generator", "make", "motion", "animated", "dark", "light", "minimal", "luxury", "editorial", "cinematic",
  "vibe", "feel", "look", "like", "inspired", "heavy", "soft", "bold", "new",
]);

// common query words → hyphenated vocab tags
const TAG_ALIASES: Record<string, string> = {
  ecommerce: "e-commerce", shop: "e-commerce", store: "e-commerce",
  web3: "crypto-web3", crypto: "crypto-web3", nft: "crypto-web3",
  food: "food-drink", restaurant: "food-drink", drink: "food-drink",
  museum: "museum-gallery", gallery: "online-gallery",
  realestate: "real-estate", estate: "real-estate",
  type: "type-foundry", font: "type-foundry", fonts: "type-foundry",
  nonprofit: "non-profit-charity", charity: "non-profit-charity",
  onepager: "one-page", singlepage: "one-page",
  interior: "architecture-interior-design", architecture: "architecture-interior-design",
};

function pickTag(query: string, vocab: string[]): string | undefined {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOPWORDS.has(t));
  const candidates = tokens.map((t) => TAG_ALIASES[t] ?? t);
  for (const t of candidates) if (vocab.includes(t)) return t;
  for (const t of candidates) for (const v of vocab) if (t === v.replace(/s$/, "") || t.replace(/s$/, "") === v) return v;
  return undefined;
}

const IMG_RE = /(?:https?:)?\/\/[^\s"'<>)\\]+?\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>)\\]*)?/gi;
const GENERIC_BAD = /(avatar|icon|logo|favicon|sprite|emoji|flag|16x16|32x32|48x48|\.svg|placeholder|blank|1x1)/i;

function absolutize(u: string, base: string): string | null {
  try {
    if (u.startsWith("//")) return "https:" + u;
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

function extractImages(html: string, base: string, src: Source): string[] {
  const scored = new Map<string, number>();
  for (const m of html.matchAll(IMG_RE)) {
    const abs = absolutize(m[0], base);
    if (!abs || GENERIC_BAD.test(abs)) continue;
    if (src.avoid?.test(abs)) continue;
    let score = 1;
    if (src.prefer?.test(abs)) score += 5;
    if (!scored.has(abs) || scored.get(abs)! < score) scored.set(abs, score);
  }
  const byKey = new Map<string, { url: string; score: number }>();
  for (const [url, score] of scored) {
    const upgraded = src.upgrade ? src.upgrade(url) : url;
    const key = src.dedupeKey ? src.dedupeKey(upgraded) : upgraded;
    const prev = byKey.get(key);
    if (!prev || score > prev.score) byKey.set(key, { url: upgraded, score });
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score).map((v) => v.url);
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
  if (!query) {
    console.log('usage: forge research "fintech landing, dark luxury" [--project <name>] [--count 6] [--tag <word>] [--url <extra-page>]');
    return;
  }
  const projectRef = flagStr(args, "project", "p");
  const projectDir = resolveProject(projectRef);
  const outDir = projectDir ? path.join(projectDir, "research") : path.resolve("research");
  const refsDir = path.join(outDir, "refs");
  fs.rmSync(refsDir, { recursive: true, force: true });
  fs.mkdirSync(refsDir, { recursive: true });
  const perSource = Number(flagStr(args, "count", "n") ?? 6);
  const forcedTag = flagStr(args, "tag", "t");

  const brief: string[] = [
    `# Design brief — ${query}`,
    ``,
    `> Generated ${new Date().toISOString()} by \`forge research\`. Fill every section before building.`,
    ``,
    `## Reference images (research/refs/)`,
    ``,
  ];
  let totalSaved = 0;

  for (const src of SOURCES) {
    if (src.kind === "link") {
      const url = src.urlFor(query, undefined);
      brief.push(`### ${src.label} — ${url}`);
      brief.push(`${src.note ?? "browse manually"}\n`);
      log.info(`${src.label}: link-only → ${url} (${src.note ?? ""})`);
      continue;
    }

    const tag = forcedTag ?? (src.vocab ? pickTag(query, src.vocab) : undefined);
    const url = src.urlFor(query, tag);
    const fallback = src.urlFor(query, undefined);

    let html = "";
    try {
      const r = await fetchWithTimeout(url, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000, redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      html = await r.text();
    } catch (e: any) {
      log.warn(`${src.label}: fetch failed (${e.message}) — skipping`);
      continue;
    }

    let imgs = extractImages(html, url, src);
    let usedUrl = url;
    // bogus category/tag → server returns an empty/unfiltered page; retry the unfiltered feed once
    if (!imgs.length && fallback !== url) {
      log.warn(`${src.label}: no results for ${url} — falling back to ${fallback}`);
      const r2 = await fetchWithTimeout(fallback, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000, redirect: "follow" }).catch(() => null);
      if (r2?.ok) {
        html = await r2.text();
        imgs = extractImages(html, fallback, src);
        usedUrl = fallback;
      }
    }

    if (!imgs.length) {
      log.warn(`${src.label}: no images in HTML — ${src.note ?? "JS-rendered? add screenshots manually"}`);
      continue;
    }

    const tagInfo = tag && usedUrl === url ? ` (filtered: ${tag})` : "";
    brief.push(`### ${src.label} — ${usedUrl}${tagInfo}`);
    if (src.note) brief.push(`\n${src.note}\n`);
    const links = extractLinks(html, usedUrl);
    if (links.length) brief.push(`\nPages worth opening: ${links.slice(0, 12).map((l) => `<${l}>`).join(" · ")}\n`);

    let saved = 0;
    for (const u of imgs) {
      if (saved >= perSource) break;
      const ext = (u.split("?")[0]!.match(/\.(png|jpe?g|webp|avif)$/i)?.[1] ?? "jpg").toLowerCase();
      const dest = path.join(refsDir, `${src.key}-${saved + 1}.${ext}`);
      try {
        const bytes = await downloadTo(u, dest);
        if (bytes < 15000) {
          fs.rmSync(dest);
          continue;
        }
        saved++;
        totalSaved++;
      } catch {
        /* skip broken */
      }
    }
    log.ok(`${src.label}: saved ${saved} reference${saved === 1 ? "" : "s"}${tagInfo}`);
  }

  const extraUrl = flagStr(args, "url");
  if (extraUrl) {
    try {
      const r = await fetchWithTimeout(extraUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000, redirect: "follow" });
      if (r.ok) {
        const html = await r.text();
        const fakeSrc: Source = { key: "extra", label: extraUrl, kind: "list", home: extraUrl, urlFor: () => extraUrl };
        const imgs = extractImages(html, extraUrl, fakeSrc);
        let saved = 0;
        for (const u of imgs) {
          if (saved >= perSource) break;
          const ext = (u.split("?")[0]!.match(/\.(png|jpe?g|webp|avif)$/i)?.[1] ?? "jpg").toLowerCase();
          const dest = path.join(refsDir, `extra-${saved + 1}.${ext}`);
          const bytes = await downloadTo(u, dest).catch(() => 0);
          if (bytes >= 15000) saved++;
          else if (bytes) fs.rmSync(dest);
        }
        totalSaved += saved;
        brief.push(`### extra — ${extraUrl}\n`);
        log.ok(`${extraUrl}: saved ${saved}`);
      }
    } catch {
      log.warn(`--url ${extraUrl}: fetch failed`);
    }
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
  if (fs.existsSync(briefPath) && args.flags.force !== true) {
    log.warn(`design-brief.md already exists — leaving it (use --force to overwrite; refs were still refreshed)`);
  } else {
    fs.writeFileSync(briefPath, brief.join("\n"));
    log.ok(`brief → ${briefPath}`);
  }
  log.info(`${totalSaved} references in ${refsDir}`);
  if (totalSaved === 0) {
    log.warn(`no references fetched — sources may be JS-rendered or offline. Fallback: browse the sources in a browser, screenshot 5–10 layouts into refs/, and fill the brief manually.`);
  }
}
