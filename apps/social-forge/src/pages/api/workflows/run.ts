import type { APIRoute } from "astro";
import { body, h, HttpError, json } from "../../../engine/api.ts";
import { getJob, loadRuns, startRun } from "../../../engine/workflows.ts";
import { getProject } from "../../../engine/projects.ts";

/** Queue a ComfyUI workflow run for a project. Returns immediately; poll with GET. */
export const POST: APIRoute = h(async ({ request }) => {
  const input = await body(request);
  if (!input.slug || !input.workflow) throw new Error("slug and workflow required");
  if (!getProject(input.slug)) throw new HttpError(404, `no project ${input.slug}`);
  const job = await startRun(input.slug, input.workflow, input.vars ?? {});
  return json({ job }, 202);
});

/** Poll one job (?slug=&id=) or list recent runs (?slug=). */
export const GET: APIRoute = h(async ({ url }) => {
  const slug = url.searchParams.get("slug");
  if (!slug) throw new Error("slug required");
  const id = url.searchParams.get("id");
  if (id) {
    const job = getJob(slug, id);
    if (!job) throw new HttpError(404, `no job ${id}`);
    return json({ job });
  }
  return json({ runs: loadRuns(slug).slice(0, 50) });
});
