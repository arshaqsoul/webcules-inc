import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * App root resolution must survive both plain Node and Astro/Vite SSR (where
 * import.meta.dirname can be undefined and modules may load from transformed code).
 * Strategy: explicit env override → walk up from this file's URL → cwd fallback,
 * validated by the workflows/manifest.json marker.
 */
function resolveForgeRoot(): string {
  const candidates: string[] = [];
  if (process.env.SOCIAL_FORGE_ROOT) candidates.push(process.env.SOCIAL_FORGE_ROOT);
  try {
    const here = path.dirname(fileURLToPath(import.meta.url)); // <root>/src/engine
    candidates.push(path.resolve(here, "..", ".."));
  } catch {}
  if (typeof import.meta.dirname === "string") candidates.push(path.resolve(import.meta.dirname, "..", ".."));
  candidates.push(process.cwd());
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "workflows", "manifest.json"))) return c;
  }
  return candidates[0]!;
}

/** webcules/projects/<name> — marketing project repos live here (each its own git repo) */
export const FORGE_ROOT = resolveForgeRoot();
export const APP_ROOT = path.join(FORGE_ROOT, "src");
export const WORKFLOWS_DIR = path.join(FORGE_ROOT, "workflows");
export const WEBCULES_ROOT = path.resolve(FORGE_ROOT, "..", "..", "..");
export const PROJECTS_ROOT = path.join(WEBCULES_ROOT, "projects");

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Deterministic RNG so regenerating with the same seed reproduces, bumping re-rolls. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function pickMany<T>(rng: () => number, arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]!);
  return out;
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeJson(p: string, data: unknown) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

export function readJsonSafe<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function projPath(slug: string, ...rel: string[]): string {
  return path.join(PROJECTS_ROOT, slug, ...rel);
}

export function safeRel(projectRoot: string, rel: string): string | null {
  const resolved = path.resolve(projectRoot, rel);
  const root = path.resolve(projectRoot);
  if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;
  return null;
}

export async function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 20000, ...rest } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

export function nowIso(): string {
  return new Date().toISOString();
}

export function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
