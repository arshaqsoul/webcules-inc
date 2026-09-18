import type { APIRoute } from "astro";
import { body, h, HttpError, json } from "../../engine/api.ts";
import { altHooks, generatePack, generatePost } from "../../engine/copy.ts";
import { commitProject, getPost, getProject, listPosts, nextPostId, savePost, setPostStatus } from "../../engine/projects.ts";
import type { Platform } from "../../engine/types.ts";

export const GET: APIRoute = h(async ({ url }) => {
  const slug = url.searchParams.get("slug");
  if (!slug) throw new Error("slug required");
  return json({ posts: listPosts(slug) });
});

/** Generate a post pack — one platform+format, or a full pack across all project platforms. */
export const POST: APIRoute = h(async ({ request }) => {
  const input = await body(request);
  if (!input.slug) throw new Error("slug required");
  const m = getProject(input.slug);
  if (!m) throw new HttpError(404, `no project ${input.slug}`);

  if (input.action === "alt-hooks") {
    if (!input.platform) throw new Error("platform required");
    return json({ hooks: altHooks(m, input.platform, input.regen ?? 0) });
  }

  let posts;
  if (input.platform) {
    const p = generatePost(m, input.platform as Platform, { format: input.format, regen: input.regen ?? 0, seedSalt: input.seedSalt });
    posts = [p];
  } else {
    posts = generatePack(m, { perPlatform: input.perPlatform, regen: input.regen ?? 0 });
  }
  for (const p of posts) savePost(input.slug, p);
  await commitProject(input.slug, `posts: generated ${posts.length} (${posts.map((p) => p.id).join(", ")})`);
  return json({ posts }, 201);
});

/** Edit / review-flow / schedule a post. */
export const PATCH: APIRoute = h(async ({ request }) => {
  const input = await body(request);
  if (!input.slug || !input.id) throw new Error("slug and id required");
  const post = getPost(input.slug, input.id);
  if (!post) throw new HttpError(404, `no post ${input.id}`);

  if (input.action === "status") {
    const updated = setPostStatus(input.slug, input.id, input.status, input.note);
    await commitProject(input.slug, `posts: ${input.id} → ${input.status}${input.note ? ` ("${input.note.slice(0, 80)}")` : ""}`);
    return json({ post: updated });
  }

  if (input.action === "regen") {
    const m = getProject(input.slug)!;
    const regen = (post.meta?.regen ?? 0) + 1;
    const fresh = generatePost(m, post.platform, { format: post.format, regen });
    post.hook = fresh.hook;
    post.copy = fresh.copy;
    post.meta = { ...fresh.meta, regen };
    const updated = savePost(input.slug, post);
    await commitProject(input.slug, `posts: regenerated ${input.id} (v${regen + 1})`);
    return json({ post: updated });
  }

  if (input.patch) {
    const { hook, copy, scheduledFor, cta, format, assets } = input.patch;
    if (hook !== undefined) post.hook = hook;
    if (copy !== undefined) post.copy = { ...post.copy, ...copy };
    if (scheduledFor !== undefined) post.scheduledFor = scheduledFor || undefined;
    if (cta !== undefined) post.cta = { ...post.cta, ...cta };
    if (format !== undefined) post.format = format;
    if (assets !== undefined) post.assets = assets;
    const updated = savePost(input.slug, post);
    await commitProject(input.slug, `posts: edited ${input.id}`);
    return json({ post: updated });
  }
  throw new Error("nothing to do (use action=status|regen or patch)");
});

export const DELETE: APIRoute = h(async ({ url }) => {
  const slug = url.searchParams.get("slug");
  const id = url.searchParams.get("id");
  if (!slug || !id) throw new Error("slug and id required");
  const post = getPost(slug, id);
  if (!post) throw new HttpError(404, `no post ${id}`);
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { projPath } = await import("../../engine/util.ts");
  fs.rmSync(path.join(projPath(slug), "posts", id), { recursive: true, force: true });
  await commitProject(slug, `posts: deleted ${id}`);
  return json({ ok: true });
});
