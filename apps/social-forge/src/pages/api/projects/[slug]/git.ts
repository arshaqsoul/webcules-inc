import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { body, h, json } from "../../../../engine/api.ts";
import { commitProject, git } from "../../../../engine/projects.ts";
import { projPath } from "../../../../engine/util.ts";

export const GET: APIRoute = h(async ({ params }) => {
  const slug = params.slug!;
  const root = projPath(slug);
  if (!fs.existsSync(path.join(root, ".git"))) return json({ repo: false, log: [] });
  const log = await git(root, "log", "--oneline", "-30").catch(() => "");
  const count = await git(root, "rev-list", "--count", "HEAD").catch(() => "0");
  const dirty = (await git(root, "status", "--porcelain").catch(() => "")).length > 0;
  return json({ repo: true, count: Number(count), dirty, log: log ? log.split("\n") : [] });
});

export const POST: APIRoute = h(async ({ params, request }) => {
  const slug = params.slug!;
  const input = await body(request);
  const hash = await commitProject(slug, input.message || "manual checkpoint");
  return json({ committed: hash });
});
