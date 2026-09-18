import fs from "node:fs";
import path from "node:path";

export const APP_ROOT = import.meta.dirname;
export const FORGE_ROOT = path.resolve(APP_ROOT, "..");
export const WORKFLOWS_DIR = path.join(FORGE_ROOT, "workflows");
export const TEMPLATE_DIR = path.join(FORGE_ROOT, "template");
/** webcules/<name> — generated projects live here as standalone repos */
export const WEBCULES_ROOT = path.resolve(FORGE_ROOT, "..", "..", "..");

const isWin = process.platform === "win32";
const ANSI = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (ANSI ? `\x1b[${code}m${s}\x1b[0m` : s);

export const log = {
  info: (s: string) => console.log(`${c("36", "forge")} ${s}`),
  ok: (s: string) => console.log(`${c("32", "forge")} ${c("32", s)}`),
  warn: (s: string) => console.log(`${c("33", "forge")} ${c("33", s)}`),
  err: (s: string) => console.error(`${c("31", "forge")} ${c("31", s)}`),
  dim: (s: string) => c("2", s),
  bold: (s: string) => c("1", s),
};

export function die(msg: string, hint?: string): never {
  log.err(msg);
  if (hint) console.error("  " + log.dim(hint));
  process.exit(1);
}

export type Args = {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
  sets: Record<string, string>;
};

/** Parses: cmd pos1 pos2 --bool-flag --key value --key=value --set k=v (repeatable) */
export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const sets: Record<string, string> = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i]!;
    if (a === "--set" || a === "-s") {
      const kv = argv[i + 1] ?? die(`--set needs key=value`);
      const eq = kv.indexOf("=");
      if (eq < 0) die(`--set expects key=value, got "${kv}"`);
      sets[kv.slice(0, eq)] = kv.slice(eq + 1);
      i += 2;
    } else if (a.startsWith("--")) {
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
  return { cmd: positional.shift() ?? "help", positional, flags, sets };
}

export function flagStr(args: Args, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = args.flags[n];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
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

/** Resolve --project: absolute path as-is, else WEBCULES_ROOT/<name> */
export function resolveProject(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (path.isAbsolute(ref) || ref.includes("/") || ref.includes("\\")) return path.resolve(ref);
  return path.join(WEBCULES_ROOT, ref);
}

export function projectOrDie(ref: string | undefined, flagName = "--project"): string {
  const p = resolveProject(ref);
  if (!p) die(`${flagName} is required (project name under webcules/ or an absolute path)`);
  if (!fs.existsSync(path.join(p, "package.json"))) die(`Not a project directory (no package.json): ${p}`);
  return p;
}

export function isTextFile(p: string): boolean {
  return /\.(astro|tsx?|jsx?|mjs|cjs|css|json|md|mdx|html|txt|svg|ya?ml|jsonc|gitignore|toml)$/i.test(path.basename(p)) || p.endsWith(".gitignore");
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

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

export async function downloadTo(url: string, dest: string): Promise<number> {
  const res = await fetchWithTimeout(url, { timeoutMs: 60000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, buf);
  return buf.length;
}

export function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export { fs, path, isWin };
