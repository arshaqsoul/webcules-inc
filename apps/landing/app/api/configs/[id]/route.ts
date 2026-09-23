/* Single saved config — PATCH (rename / re-configure) + DELETE, both
 * ownership-checked. Client contract in lib/saved-configs.ts. */
import { and, eq } from "drizzle-orm";

import { getSavedConfigForUser } from "@/lib/auth.server";
import { getDb } from "@/lib/db";
import { savedConfigs } from "@/lib/db-schema";
import { getSessionUser } from "@/lib/session";

const MAX_TITLE_LENGTH = 120;
const MAX_CONFIG_BYTES = 32 * 1024;

function json(data: unknown, status: number): Response {
  return Response.json(data, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (!isRecord(body)) return json({ error: "invalid body" }, 400);

  const { config, title } = body;
  const updates: { title?: string; config?: string } = {};

  if (title !== undefined) {
    if (typeof title !== "string" || title.length > MAX_TITLE_LENGTH) {
      return json({ error: `title must be a string of at most ${MAX_TITLE_LENGTH} characters` }, 400);
    }
    updates.title = title;
  }
  if (config !== undefined) {
    if (!isRecord(config)) return json({ error: "config must be a JSON object" }, 400);
    const configJson = JSON.stringify(config);
    if (configJson.length > MAX_CONFIG_BYTES) {
      return json({ error: "config too large (max 32KB)" }, 400);
    }
    updates.config = configJson;
  }
  if (Object.keys(updates).length === 0) {
    return json({ error: "nothing to update" }, 400);
  }

  const db = await getDb();

  // Ownership check first, so a foreign/missing id is indistinguishable (404).
  const existing = await getSavedConfigForUser(id, user.id);
  if (!existing) return json({ error: "not found" }, 404);

  await db
    .update(savedConfigs)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(savedConfigs.id, id), eq(savedConfigs.userId, user.id)));
  return json({ ok: true, id }, 200);
}

export async function DELETE(_req: Request, ctx: RouteContext): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { id } = await ctx.params;

  const db = await getDb();

  // Ownership check first, so a foreign/missing id is indistinguishable (404).
  const existing = await getSavedConfigForUser(id, user.id);
  if (!existing) return json({ error: "not found" }, 404);

  await db.delete(savedConfigs).where(and(eq(savedConfigs.id, id), eq(savedConfigs.userId, user.id)));
  return json({ ok: true }, 200);
}
