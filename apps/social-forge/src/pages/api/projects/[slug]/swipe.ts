import type { APIRoute } from "astro";
import { body, h, HttpError, json } from "../../../../engine/api.ts";
import { addEntry, deleteEntry, fetchOg, loadSwipe, saveThumb, SWIPE_KEYS, updateEntry } from "../../../../engine/swipe.ts";
import { commitProject } from "../../../../engine/projects.ts";
import type { SwipeEntry, SwipeKey } from "../../../../engine/types.ts";

export const GET: APIRoute = h(async ({ params }) => {
  const slug = params.slug!;
  const out: Record<string, SwipeEntry[]> = {};
  for (const k of SWIPE_KEYS) out[k] = loadSwipe(slug, k);
  return json({ swipe: out });
});

export const POST: APIRoute = h(async ({ params, request }) => {
  const slug = params.slug!;
  const input = await body(request);
  if (!SWIPE_KEYS.includes(input.key)) throw new Error(`key must be one of: ${SWIPE_KEYS.join(", ")}`);
  if (!input.title && !input.url) throw new Error("title or url required");

  // best-effort metadata + thumbnail when a URL is pasted
  let title = input.title;
  let thumb = input.thumb;
  if (input.url && input.autofetch !== false) {
    try {
      const og = await fetchOg(input.url);
      if (!title && og.title) title = og.title;
      if (!input.description && og.description) input.why = input.why || og.description?.slice(0, 200);
      if (!thumb && og.image) thumb = await saveThumb(slug, og.image);
    } catch {
      // ad libraries are JS-rendered; manual entry stays valid
    }
  }

  const entry = addEntry(slug, {
    key: input.key as SwipeKey,
    title: title ?? input.url ?? "untitled reference",
    url: input.url,
    kind: input.kind ?? "ad",
    hook: input.hook,
    format: input.format,
    why: input.why ?? "",
    tags: input.tags ?? [],
    thumb,
  });
  await commitProject(slug, `swipe: add ${entry.key} ref "${entry.title.slice(0, 60)}"`);
  return json({ entry }, 201);
});

export const PATCH: APIRoute = h(async ({ params, request }) => {
  const slug = params.slug!;
  const input = await body(request);
  if (!input.id) throw new Error("id required");
  const entry = updateEntry(slug, input.id, input.patch ?? input);
  if (!entry) throw new HttpError(404, `no swipe entry ${input.id}`);
  await commitProject(slug, `swipe: update ${input.id}`);
  return json({ entry });
});

export const DELETE: APIRoute = h(async ({ params, url }) => {
  const slug = params.slug!;
  const id = url.searchParams.get("id");
  if (!id) throw new Error("id required");
  const ok = deleteEntry(slug, id);
  if (!ok) throw new HttpError(404, `no swipe entry ${id}`);
  await commitProject(slug, `swipe: remove ${id}`);
  return json({ ok: true });
});
