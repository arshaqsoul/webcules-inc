import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * App root resolution must survive both plain Node and Astro/Vite SSR (where
 * import.meta.dirname can be undefined and modules may load from transformed code).
 * Strategy: explicit env override → walk up from this file's URL → cwd fallback,
 * validated by the package.json marker.
 */
function resolveForgeRoot(): string {
  const candidates: string[] = [];
  if (process.env.SOCIAL_FORGE_ROOT) candidates.push(process.env.SOCIAL_FORGE_ROOT);
  try {
    const here = path.dirname(fileURLToPath(import.meta.url)); // <root>/src/social
    candidates.push(path.resolve(here, "..", ".."));
  } catch {}
  if (typeof import.meta.dirname === "string") candidates.push(path.resolve(import.meta.dirname, "..", ".."));
  candidates.push(process.cwd());
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "package.json"))) return c;
  }
  return candidates[0]!;
}

/** webcules/social/<name> — motion-component projects live here (each its own git repo) */
export const FORGE_ROOT = resolveForgeRoot();
export const APP_ROOT = path.join(FORGE_ROOT, "src");
export const REPO_ROOT = path.resolve(FORGE_ROOT, "..", ".."); // webcules-inc/
export const WEBCULES_ROOT = path.resolve(FORGE_ROOT, "..", "..", ".."); // projects root (webcules/<name>, same as site-forge)
export const SOCIAL_ROOT = path.join(WEBCULES_ROOT, "social");
export const UI_ROOT = path.join(REPO_ROOT, "packages", "ui");
export const PROJECTS_ROOT = SOCIAL_ROOT;

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

export type Args = {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
};

/** Parses: cmd pos1 pos2 --bool-flag --key value --key=value */
export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        i += 1;
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
        flags[body] = argv[i + 1]!;
        i += 2;
      } else {
        flags[body] = true;
        i += 1;
      }
    } else {
      positional.push(a);
      i += 1;
    }
  }
  return { cmd: positional.shift() ?? "help", positional, flags };
}

export function flagStr(args: Args, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = args.flags[n];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

const isWin = process.platform === "win32";
const ANSI = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (ANSI ? `\x1b[${code}m${s}\x1b[0m` : s);

export const log = {
  info: (s: string) => console.log(`${c("36", "social")} ${s}`),
  ok: (s: string) => console.log(`${c("36", "social")} ${c("32", s)}`),
  warn: (s: string) => console.log(`${c("33", "social")} ${c("33", s)}`),
  err: (s: string) => console.error(`${c("31", "social")} ${c("31", s)}`),
  dim: (s: string) => c("2", s),
  bold: (s: string) => c("1", s),
};

export function die(msg: string, hint?: string): never {
  log.err(msg);
  if (hint) console.error("  " + log.dim(hint));
  process.exit(1);
}

export type Manifest = {
  slug: string;
  created: string;
  source: string;
  component: { name: string; file: string; demo: string; description?: string; registryUrl?: string; docs?: string; preview?: string; poster?: string };
  reference: { file: string; kind: string };
  status: "ingested" | "analyzed" | "built" | "synced" | "packaged" | "rendered" | "posted";
  variants: Record<string, Record<string, string>>;
  catchphrase: string;
  cta: string;
  hashtags: string[];
};

export function manifestPath(slug: string): string {
  return path.join(SOCIAL_ROOT, slug, "social.project.json");
}

export function readManifest(slug: string): Manifest {
  if (!fs.existsSync(manifestPath(slug))) die(`no project "${slug}" — run: social ingest <reference> --name ${slug}`);
  return readJsonSafe<Manifest>(manifestPath(slug), null as unknown as Manifest);
}

export function writeManifest(slug: string, m: Manifest) {
  ensureDir(path.dirname(manifestPath(slug)));
  fs.writeFileSync(manifestPath(slug), JSON.stringify(m, null, 2) + "\n");
}

/** ffmpeg resolution: FFMPEG_PATH env → ComfyUI's bundled imageio-ffmpeg → ffmpeg-static → PATH */
export function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const comfyVenv = path.resolve(WEBCULES_ROOT, "..", "ComfyUI", ".venv", "Lib", "site-packages", "imageio_ffmpeg", "binaries");
  if (fs.existsSync(comfyVenv)) {
    const exe = fs.readdirSync(comfyVenv).find((f) => /^ffmpeg-.*\.(exe)$/.test(f));
    if (exe) return path.join(comfyVenv, exe);
  }
  try {
    const p = (0, eval)("require")("ffmpeg-static");
    if (p && fs.existsSync(p)) return p as string;
  } catch {}
  return "ffmpeg";
}
