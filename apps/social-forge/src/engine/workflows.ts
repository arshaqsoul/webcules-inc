import fs from "node:fs";
import path from "node:path";
import { Comfy, interpolate } from "./comfy.ts";
import { ensureDir, nowIso, projPath, randomSeed, readJsonSafe, writeJson, WORKFLOWS_DIR } from "./util.ts";
import { commitProject } from "./projects.ts";
import type { WorkflowJob } from "./types.ts";

export type WorkflowMeta = {
  title: string;
  produces: "image" | "video";
  models: string[];
  use_for: string;
  defaults: Record<string, unknown>;
  var_docs?: Record<string, string>;
};

export function workflowManifest(): Record<string, WorkflowMeta> {
  const p = path.join(WORKFLOWS_DIR, "manifest.json");
  const raw = readJsonSafe<{ workflows?: Record<string, WorkflowMeta> }>(p, {});
  return raw.workflows ?? {};
}

export function workflowNames(): string[] {
  const m = workflowManifest();
  return Object.keys(m).filter((n) => fs.existsSync(path.join(WORKFLOWS_DIR, `${n}.json`)));
}

// ---------- run tracking ----------
// In-memory live state + persisted history in the project's workflows/runs.json

const live = new Map<string, WorkflowJob>();

function runsFile(slug: string) {
  return projPath(slug, "workflows", "runs.json");
}

export function loadRuns(slug: string): WorkflowJob[] {
  return readJsonSafe<WorkflowJob[]>(runsFile(slug), []);
}

function persistRun(slug: string, job: WorkflowJob) {
  const runs = loadRuns(slug);
  const i = runs.findIndex((r) => r.id === job.id);
  if (i >= 0) runs[i] = job;
  else runs.unshift(job);
  writeJson(runsFile(slug), runs.slice(0, 200));
}

export function getJob(slug: string, id: string): WorkflowJob | undefined {
  return live.get(id) ?? loadRuns(slug).find((r) => r.id === id);
}

/**
 * Queue a workflow run. Returns immediately with the job; generation continues in the
 * background and the job is polled from the UI. Outputs are imported into
 * assets/{images|videos}/ with a sidecar .meta.json so every asset is reproducible.
 */
export async function startRun(slug: string, workflow: string, vars: Record<string, unknown>): Promise<WorkflowJob> {
  const meta = workflowManifest()[workflow];
  if (!meta) throw new Error(`unknown workflow: ${workflow}`);
  const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, `${workflow}.json`), "utf8");
  const merged = { ...meta.defaults, ...vars } as Record<string, unknown>;
  if (merged.seed === undefined || merged.seed === "" || merged.seed === "auto") merged.seed = randomSeed();
  // image→video workflows take a project-relative source image; upload it to ComfyUI first
  if (typeof merged.image === "string" && !merged.image.startsWith("http")) {
    const abs = path.isAbsolute(merged.image) ? merged.image : projPath(slug, merged.image);
    if (fs.existsSync(abs)) merged.image = await new Comfy().uploadImage(abs);
  }
  const { graph, missing } = interpolate(raw, merged);
  if (missing.length) throw new Error(`workflow ${workflow} has unfilled vars: ${missing.join(", ")}`);

  const job: WorkflowJob = {
    id: "run_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    workflow,
    vars: merged,
    status: "queued",
    outputs: [],
    startedAt: nowIso(),
  };
  live.set(job.id, job);
  persistRun(slug, job);

  // fire & track — never block the request
  void (async () => {
    const comfy = new Comfy();
    try {
      job.status = "running";
      persistRun(slug, job);
      job.promptId = await comfy.queue(graph);
      const res = await comfy.wait(job.promptId, 40 * 60 * 1000);
      const kindDir = meta.produces === "video" ? "videos" : "images";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      for (const f of res.outputs) {
        const buf = await comfy.download(f);
        const base = `${slug}_${workflow}_${stamp}`;
        const ext = path.extname(f.filename) || (f.kind === "video" ? ".mp4" : ".png");
        const out = path.join(projPath(slug, "assets", kindDir), base + ext);
        ensureDir(path.dirname(out));
        fs.writeFileSync(out, buf);
        const rel = `assets/${kindDir}/${path.basename(out)}`;
        job.outputs.push({ path: rel, kind: f.kind === "video" ? "video" : "image", filename: path.basename(out), elapsedSec: res.elapsedSec });
        writeJson(out.replace(/\.(png|jpg|jpeg|webp|mp4|webm)$/i, "") + ".meta.json", {
          workflow,
          vars: merged,
          comfyFile: f,
          generatedAt: nowIso(),
        });
      }
      job.status = "done";
      job.finishedAt = nowIso();
    } catch (e: any) {
      job.status = "error";
      job.error = String(e.message ?? e).slice(0, 2000);
      job.finishedAt = nowIso();
    }
    persistRun(slug, job);
    live.delete(job.id);
    await commitProject(slug, `assets: ${workflow} run ${job.status} (${job.outputs.length} file${job.outputs.length === 1 ? "" : "s"})`);
  })();

  return job;
}
