import fs from "node:fs";
import path from "node:path";
import { Comfy, interpolate } from "./comfy.ts";
import { die, flagStr, human, log, projectOrDie, randomSeed, readJson, slugify, writeJson, type Args, WORKFLOWS_DIR } from "./util.ts";

type Job = {
  name?: string;
  workflow: string;
  enabled?: boolean;
  out?: string;
  vars?: Record<string, unknown>;
};

export function loadManifest(): { workflows: Record<string, any> } {
  return readJson(path.join(WORKFLOWS_DIR, "manifest.json"));
}

function workflowPath(name: string): string {
  const p = path.join(WORKFLOWS_DIR, `${name}.json`);
  if (!fs.existsSync(p)) {
    const known = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".json") && f !== "manifest.json").map((f) => f.replace(".json", ""));
    die(`unknown workflow "${name}" — available: ${known.join(", ")}`);
  }
  return p;
}

async function runJob(comfy: Comfy, projectDir: string, job: Job, extraSets: Record<string, string>, force: boolean): Promise<string | null> {
  const manifest = loadManifest();
  const meta = manifest.workflows[job.workflow];
  if (!meta) die(`"${job.workflow}" is missing an entry in workflows/manifest.json`);

  const outName = job.out ? slugify(path.basename(job.out, path.extname(job.out))) : slugify(job.name ?? job.workflow);
  const destDir = path.join(projectDir, "public", "assets");
  const primary = path.join(destDir, job.out ? job.out.replace(path.basename(job.out), slugify(path.basename(job.out, path.extname(job.out))) + path.extname(job.out)) : `${outName}.bin`);

  if (!force && fs.existsSync(primary)) {
    log.warn(`skip ${path.relative(projectDir, primary)} (exists — use --force to regenerate)`);
    return null;
  }

  // merge precedence: manifest defaults < job vars < CLI --set
  const vars: Record<string, unknown> = { ...(meta.defaults ?? {}), ...(job.vars ?? {}), ...extraSets };

  // workflows that need an input image: upload to ComfyUI first
  if (typeof vars.image === "string" && vars.image) {
    const imgPath = path.isAbsolute(vars.image) ? vars.image : path.resolve(projectDir, vars.image);
    if (!fs.existsSync(imgPath)) die(`image not found: ${imgPath}`);
    log.info(`uploading ${path.basename(imgPath)} → ComfyUI`);
    vars.image = await comfy.uploadImage(imgPath);
  }

  if (vars.seed === "random" || vars.seed === undefined || vars.seed === "") vars.seed = randomSeed();

  const raw = fs.readFileSync(workflowPath(job.workflow), "utf8");
  const prefix = outName;
  const { graph, missing } = interpolate(raw, { ...vars, prefix });
  if (missing.length) {
    const docs = meta.var_docs ?? {};
    const lines = missing.map((m) => `  {{${m}}}${docs[m] ? " — " + docs[m] : ""}`);
    die(`workflow "${job.workflow}" has unfilled variables:\n${lines.join("\n")}\n  pass them with --set ${missing[0]}="..."`);
  }

  const label = job.name ?? job.out ?? job.workflow;
  log.info(`▶ ${label} [${job.workflow}] seed=${vars.seed}`);
  const t0 = Date.now();
  const promptId = await comfy.queue(graph);
  const res = await comfy.wait(promptId, 40 * 60 * 1000, (el) => {
    if (el % 20 === 0 && el > 0) log.info(`  … ${label} still sampling (${el}s)`);
  });
  if (!res.outputs.length) die(`no outputs produced for ${label} (prompt ${promptId})`);

  fs.mkdirSync(destDir, { recursive: true });
  const saved: string[] = [];
  for (let i = 0; i < res.outputs.length; i++) {
    const f = res.outputs[i]!;
    const buf = await comfy.download(f);
    const srcExt = path.extname(f.filename) || (f.kind === "video" ? ".mp4" : ".png");
    let dest: string;
    if (i === 0) {
      const base = job.out ? slugify(path.basename(job.out, path.extname(job.out))) : outName;
      const ext = path.extname(job.out ?? "") || srcExt;
      dest = path.join(destDir, base + ext);
    } else {
      dest = path.join(destDir, `${outName}-${i + 1}${srcExt}`);
    }
    fs.writeFileSync(dest, buf);
    saved.push(path.relative(projectDir, dest));
  }

  // record in the project's asset ledger
  const ledgerPath = path.join(projectDir, "forge.assets.json");
  const ledger = fs.existsSync(ledgerPath) ? readJson(ledgerPath) : { jobs: [], history: [] };
  ledger.history ??= [];
  ledger.history.push({ name: label, workflow: job.workflow, vars, out: saved[0], promptId, seconds: res.elapsedSec, bytes: fs.statSync(path.join(projectDir, saved[0]!)).size, at: new Date().toISOString() });
  writeJson(ledgerPath, ledger);

  log.ok(`✔ ${label} → ${saved.join(", ")} (${human(fs.statSync(path.join(projectDir, saved[0]!)).size)}, ${res.elapsedSec}s)`);
  return saved[0] ?? null;
}

export async function cmdGenerate(args: Args) {
  const projectDir = projectOrDie(flagStr(args, "project", "p"));
  const comfy = new Comfy(flagStr(args, "url"));
  await comfy.systemStats().catch((e) => die(`ComfyUI unreachable at ${comfy.url} — start it first (${e.message})`));

  const workflow = flagStr(args, "workflow", "w");
  const manifestFile = flagStr(args, "manifest", "m");
  const only = flagStr(args, "only");
  const force = args.flags.force === true;

  if (workflow) {
    const out = flagStr(args, "out", "o");
    await runJob(comfy, projectDir, { workflow, out, vars: {} }, args.sets, force);
    return;
  }

  const mPath = manifestFile ? path.resolve(manifestFile) : path.join(projectDir, "forge.assets.json");
  if (!fs.existsSync(mPath)) die(`no manifest at ${mPath} — pass --workflow/--set or create forge.assets.json`);
  const m = readJson(mPath);
  const jobs: Job[] = m.jobs ?? [];
  if (!jobs.length) die(`manifest has no jobs`);
  let done = 0;
  for (const job of jobs) {
    if (job.enabled === false) { log.info(`⊘ ${job.name ?? job.workflow} (disabled)`); continue; }
    if (only && job.name !== only) continue;
    await runJob(comfy, projectDir, job, args.sets, force);
    done++;
  }
  log.ok(`generated ${done} asset${done === 1 ? "" : "s"} into ${path.join(path.basename(projectDir), "public", "assets")}`);
}

export async function cmdEdit(args: Args) {
  const projectDir = projectOrDie(flagStr(args, "project", "p"));
  const image = flagStr(args, "image", "i") ?? die("--image is required");
  const prompt = flagStr(args, "prompt") ?? die("--prompt is required");
  const comfy = new Comfy(flagStr(args, "url"));
  await comfy.systemStats().catch((e) => die(`ComfyUI unreachable at ${comfy.url} (${e.message})`));
  const out = flagStr(args, "out", "o") ?? slugify(path.basename(image, path.extname(image))) + "-edit";
  await runJob(comfy, projectDir, { workflow: "qwen-image-edit", out, vars: { image, prompt } }, args.sets, true);
}

export async function cmdWorkflows() {
  const m = loadManifest();
  console.log("\nReusable ComfyUI workflows (workflows/):\n");
  for (const [name, meta] of Object.entries(m.workflows)) {
    console.log(`  ${log.bold(name)}  — ${meta.title}`);
    console.log(`    ${meta.use_for}`);
    console.log(`    defaults: ${JSON.stringify(meta.defaults)}\n`);
  }
}

export async function cmdModels(args: Args) {
  const comfy = new Comfy(flagStr(args, "url"));
  const inv = await comfy.inventory();
  for (const [k, v] of Object.entries(inv)) console.log(`${log.bold(k)}: ${v.length ? v.join(", ") : log.dim("(none)")}`);
}
