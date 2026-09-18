import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Comfy } from "./comfy.ts";
import { flagStr, log, WEBCULES_ROOT, WORKFLOWS_DIR, type Args } from "./util.ts";
import { loadManifest } from "./assets.ts";

const ok = (s: string) => log.ok(s);
const bad = (s: string, fix: string) => { log.err(s); console.log("    fix: " + log.dim(fix)); };
const meh = (s: string) => log.warn(s);

function sh(cmd: string, argsArr: string[]) {
  const r = spawnSync(cmd, argsArr, { shell: true, encoding: "utf8" });
  return { ok: r.status === 0, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim() };
}

export async function cmdDoctor(args: Args) {
  console.log(log.bold("\nsite-forge doctor\n"));

  // node / pnpm
  const node = sh("node", ["-v"]);
  node.ok ? ok(`node ${node.out}`) : bad("node not found", "install Node 22+");
  const pnpm = sh("pnpm", ["-v"]);
  pnpm.ok ? ok(`pnpm ${pnpm.out}`) : bad("pnpm not found", "corepack enable && corepack prepare pnpm@latest --activate");

  // ComfyUI + model inventory vs workflow requirements
  const comfy = new Comfy(flagStr(args, "url"));
  try {
    const stats: any = await comfy.systemStats();
    const dev = stats.devices?.[0];
    ok(`ComfyUI ${stats.system?.comfyui_version} at ${comfy.url} — ${dev?.name ?? "?"} (${(dev?.vram_total ?? 0) / 1024 ** 3 | 0} GB VRAM)`);
    const inv = await comfy.inventory();
    const allModels = new Set(Object.values(inv).flat());
    const manifest = loadManifest();
    for (const [name, meta] of Object.entries<any>(manifest.workflows)) {
      const missing = (meta.models ?? []).filter((m: string) => !allModels.has(m));
      if (missing.length) meh(`workflow ${name}: missing models ${missing.join(", ")}`);
    }
    ok(`workflow model check done (${Object.keys(manifest.workflows).length} workflows)`);
  } catch (e: any) {
    bad(`ComfyUI unreachable at ${comfy.url}`, "start ComfyUI (ComfyUI/start_comfyui_server.bat) or set COMFY_URL");
  }

  // github
  const gh = sh("gh", ["auth", "status"]);
  gh.ok ? ok("gh CLI authenticated") : meh("gh CLI missing/not authed — forge publish will print manual steps (winget install GitHub.cli && gh auth login)");

  // cloudflare
  const wr = sh("npx", ["--no-install", "wrangler", "--version"]);
  wr.ok ? ok(`wrangler ${wr.out.split(/\s+/).pop()}`) : meh("wrangler not installed globally — projects carry their own copy via devDependencies");

  // projects
  if (fs.existsSync(WEBCULES_ROOT)) {
    const projects = fs.readdirSync(WEBCULES_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(WEBCULES_ROOT, d.name, "forge.config.json")))
      .map((d) => d.name);
    log.info(`generated projects in webcules/: ${projects.length ? projects.join(", ") : "(none yet — forge new <name>)"}`);
  }
  console.log();
  log.info(`templates dir: ${WORKFLOWS_DIR}`);
}
