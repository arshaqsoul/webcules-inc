import type { APIRoute } from "astro";
import { body, h, HttpError, json } from "../../engine/api.ts";
import { autoSchedule, buildScheduleCsv, writeScheduleFiles } from "../../engine/calendar.ts";
import { commitProject, getPost, getProject, listPosts, savePost } from "../../engine/projects.ts";
import { assemblePost } from "../../engine/render.ts";

/**
 * Export: (re)render approved/scheduled posts, write schedule.csv + schedule.ics into
 * the project root, and return the platform-ready manifest. This is the "publish pack".
 */
export const POST: APIRoute = h(async ({ request }) => {
  const input = await body(request);
  if (!input.slug) throw new Error("slug required");
  const m = getProject(input.slug);
  if (!m) throw new HttpError(404, `no project ${input.slug}`);

  if (input.action === "auto-schedule") {
    const updated = autoSchedule(m);
    for (const p of updated) savePost(input.slug, p);
    await commitProject(input.slug, `schedule: auto-scheduled ${updated.length} approved posts`);
    return json({ scheduled: updated });
  }

  if (input.action === "set-schedule" && input.id && input.when) {
    const post = getPost(input.slug, input.id);
    if (!post) throw new HttpError(404, `no post ${input.id}`);
    post.scheduledFor = new Date(input.when).toISOString();
    post.status = post.status === "approved" ? "scheduled" : post.status;
    savePost(input.slug, post);
    await commitProject(input.slug, `schedule: ${input.id} → ${post.scheduledFor}`);
    return json({ post });
  }

  // default: export the pack
  const posts = listPosts(input.slug).filter((p) => ["approved", "scheduled"].includes(p.status) && (input.ids ? input.ids.includes(p.id) : true));
  const rendered: Record<string, string[]> = {};
  for (const p of posts) {
    await assemblePost(m, p);
    p.status = "exported";
    savePost(input.slug, p);
    rendered[p.id] = p.assets.map((a) => a.path);
  }
  const { csv, ics } = writeScheduleFiles(m);
  await commitProject(input.slug, `export: ${posts.length} post pack(s) + schedule.csv/ics`);
  return json({ exported: rendered, csvPreview: csv.split("\r\n").slice(0, 12).join("\n"), files: { csv: "schedule.csv", ics: "schedule.ics" } });
});
