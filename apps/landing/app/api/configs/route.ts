/* Saved component configs — POST (create/update) + GET (list) for the
 * playground "Save" flow. Client contract in lib/saved-configs.ts. */
import { and, eq } from "drizzle-orm";

import { listSavedConfigsForUser } from "@/lib/auth.server";
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

type ParsedSaveBody = {
  component: string;
  title: string;
  config: Record<string, unknown>;
  id?: string;
};

function parseSaveBody(body: unknown): { ok: true; value: ParsedSaveBody } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "invalid body" };

  const { component, config, title, id } = body;

  if (typeof component !== "string" || component.trim().length === 0) {
    return { ok: false, error: "component must be a non-empty string" };
  }
  if (!isRecord(config)) {
    return { ok: false, error: "config must be a JSON object" };
  }
  if (JSON.stringify(config).length > MAX_CONFIG_BYTES) {
    return { ok: false, error: "config too large (max 32KB)" };
  }
  if (title !== undefined && (typeof title !== "string" || title.length > MAX_TITLE_LENGTH)) {
    return { ok: false, error: `title must be a string of at most ${MAX_TITLE_LENGTH} characters` };
  }
  if (id !== undefined && (typeof id !== "string" || id.length === 0)) {
    return { ok: false, error: "id must be a non-empty string" };
  }

  return {
    ok: true,
    value: {
      component,
      title: typeof title === "string" ? title : "",
      config,
      id,
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const parsed = parseSaveBody(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { component, title, config, id } = parsed.value;

  const db = await getDb();
  const configJson = JSON.stringify(config);
  const now = new Date();

  if (id !== undefined) {
    // Update in place — only when the row exists AND belongs to this user.
    const owned = await db
      .select({ id: savedConfigs.id })
      .from(savedConfigs)
      .where(and(eq(savedConfigs.id, id), eq(savedConfigs.userId, user.id)))
      .limit(1);
    if (!owned[0]) return json({ error: "not found" }, 404);

    await db
      .update(savedConfigs)
      .set({ component, title, config: configJson, updatedAt: now })
      .where(and(eq(savedConfigs.id, id), eq(savedConfigs.userId, user.id)));
    return json({ ok: true, id }, 200);
  }

  const newId = crypto.randomUUID();
  await db.insert(savedConfigs).values({
    id: newId,
    userId: user.id,
    component,
    title,
    config: configJson,
    createdAt: now,
    updatedAt: now,
  });
  return json({ ok: true, id: newId }, 200);
}

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const configs = await listSavedConfigsForUser(user.id);
  return json({ configs }, 200);
}
