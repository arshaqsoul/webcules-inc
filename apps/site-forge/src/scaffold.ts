import fs from "node:fs";
import path from "node:path";
import { die, flagStr, log, slugify, TEMPLATE_DIR, WEBCULES_ROOT, writeJson, type Args } from "./util.ts";

const TOKENS = ["FORGE_NAME", "FORGE_TITLE", "FORGE_DESC", "FORGE_URL", "FORGE_YEAR"];

function applyTokens(dir: string, vars: Record<string, string>) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".astro" || entry.name === "dist") continue;
      applyTokens(p, vars);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    const texty = ["", ".astro", ".ts", ".tsx", ".mjs", ".json", ".jsonc", ".css", ".md", ".html", ".txt", ".svg", ".yml", ".yaml", ".gitignore", ".toml"].includes(ext) || entry.name.startsWith(".");
    if (!texty) continue;
    let s = fs.readFileSync(p, "utf8");
    const before = s;
    for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(v);
    if (s !== before) fs.writeFileSync(p, s);
  }
}

export async function cmdNew(args: Args) {
  const rawName = args.positional[0] ?? die("usage: forge new <project-name> [--title \"...\"] [--desc \"...\"] [--url https://...] [--dir <abs-path>] [--force]");
  const name = slugify(rawName);
  if (!name) die(`"${rawName}" doesn't slugify to a valid project name`);
  const dir = flagStr(args, "dir");
  const target = dir ? path.resolve(dir) : path.join(WEBCULES_ROOT, name);

  if (fs.existsSync(target) && fs.readdirSync(target).length && args.flags.force !== true) {
    die(`target exists and is not empty: ${target} (use --force)`);
  }
  if (!fs.existsSync(TEMPLATE_DIR)) die(`template missing: ${TEMPLATE_DIR}`);

  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(TEMPLATE_DIR, target, { recursive: true, filter: (src) => {
    const rel = path.relative(TEMPLATE_DIR, src);
    return !rel.startsWith("node_modules") && !rel.startsWith(".astro") && !path.basename(src).startsWith("pnpm-lock");
  }});

  const title = flagStr(args, "title") ?? rawName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const desc = flagStr(args, "desc") ?? `${title} — designed and generated with site-forge.`;
  // workers.dev URLs are <name>.<account-subdomain>.workers.dev — this machine's Cloudflare account is "webculesco"
  const subdomain = process.env.WORKERS_SUBDOMAIN ?? "webculesco";
  const url = flagStr(args, "url") ?? `https://${name}.${subdomain}.workers.dev`;

  applyTokens(target, { FORGE_NAME: name, FORGE_TITLE: title, FORGE_DESC: desc, FORGE_URL: url, FORGE_YEAR: String(new Date().getFullYear()) });

  writeJson(path.join(target, "forge.config.json"), {
    name,
    title,
    description: desc,
    url,
    template: "astro-premium",
    created: new Date().toISOString(),
    comfy_url: process.env.COMFY_URL ?? "http://127.0.0.1:8188",
  });

  fs.mkdirSync(path.join(target, "research", "refs"), { recursive: true });

  log.ok(`project ready → ${target}`);
  console.log(`
  next steps:
    cd ${path.relative(process.cwd(), target) || "."}
    pnpm install
    forge research "${desc.slice(0, 60)}" --project ${name}     # phase 1 — references + brief
    # fill research/design-brief.md, plan assets, write forge.assets.json
    forge generate --project ${name} --manifest                 # phase 2 — assets via ComfyUI
    pnpm dev                                                     # phase 3 — build & preview
`);
}
