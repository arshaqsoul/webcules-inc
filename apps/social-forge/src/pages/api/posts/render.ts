import type { APIRoute } from "astro";
import { body, h, HttpError, json } from "../../../engine/api.ts";
import { assemblePost } from "../../../engine/render.ts";
import { commitProject, getPost, getProject, savePost } from "../../../engine/projects.ts";

/** Render the final platform-ready creatives for a post (bg + copy → PNG/PDF/txt bundle). */
export const POST: APIRoute = h(async ({ request }) => {
  const input = await body(request);
  if (!input.slug || !input.id) throw new Error("slug and id required");
  const m = getProject(input.slug);
  if (!m) throw new HttpError(404, `no project ${input.slug}`);
  const post = getPost(input.slug, input.id);
  if (!post) throw new HttpError(404, `no post ${input.id}`);
  const files = await assemblePost(m, post, { bg: input.bg });
  savePost(input.slug, post);
  await commitProject(input.slug, `posts: rendered ${input.id} (${files.length} files)`);
  return json({ files, post });
});
