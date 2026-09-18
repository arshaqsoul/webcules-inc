import type { APIRoute } from "astro";
import { body, h, json } from "../../engine/api.ts";
import { createProject, initProjectRepo, listProjects } from "../../engine/projects.ts";

export const GET: APIRoute = h(async () => json({ projects: listProjects() }));

export const POST: APIRoute = h(async ({ request }) => {
  const input = await body(request);
  if (!input.name || !input.brief) throw new Error("name and brief are required");
  const { slug } = createProject(input);
  await initProjectRepo(slug);
  const { getProject } = await import("../../engine/projects.ts");
  return json({ project: getProject(slug) }, 201);
});
