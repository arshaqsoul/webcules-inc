import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { body, h, HttpError, json } from "../../../../engine/api.ts";
import { fileTree, getProject, listPosts, touchManifest } from "../../../../engine/projects.ts";
import { loadSwipe, SWIPE_KEYS } from "../../../../engine/swipe.ts";
import { loadRuns } from "../../../../engine/workflows.ts";
import { writeJson, projPath } from "../../../../engine/util.ts";
import { commitProject } from "../../../../engine/projects.ts";

export const GET: APIRoute = h(async ({ params }) => {
  const m = getProject(params.slug!);
  if (!m) throw new HttpError(404, `no project ${params.slug}`);
  const swipe: Record<string, number> = {};
  for (const k of SWIPE_KEYS) swipe[k] = loadSwipe(m.slug, k).length;
  return json({
    project: m,
    posts: listPosts(m.slug),
    swipe,
    runs: loadRuns(m.slug).slice(0, 30),
    tree: fileTree(m.slug),
  });
});

export const PATCH: APIRoute = h(async ({ params, request }) => {
  const slug = params.slug!;
  const m = getProject(slug);
  if (!m) throw new HttpError(404, `no project ${slug}`);
  const patch = await body(request);
  const allowed = ["name", "brief", "tone", "platforms", "brand", "offer", "status"] as const;
  for (const k of allowed) if (patch[k] !== undefined) (m as any)[k] = patch[k];
  writeJson(projPath(slug, "marketing.json"), m);
  if (patch.brief !== undefined) {
    fs.writeFileSync(
      path.join(projPath(slug), "brief.md"),
      `# ${m.name}\n\n${m.brief}\n\n## Offer\n\n- **Product:** ${m.offer.product}\n- **Promise:** ${m.offer.promise}\n- **Audience:** ${m.offer.audience}\n- **Tone:** ${m.tone}\n\n## Pains we speak to\n\n${m.offer.pains.map((p) => `- ${p}`).join("\n")}\n\n## Proof\n\n${m.offer.proofs.map((p) => `- ${p}`).join("\n")}\n`,
    );
  }
  const out = touchManifest(slug);
  await commitProject(slug, "project: update brief/branding");
  return json({ project: out });
});
