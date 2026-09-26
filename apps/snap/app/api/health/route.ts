/* Liveness + dependency probe: verifies the worker, D1 binding, and schema. */
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const db = getDb();
    // Touch real schema: organization table exists ⇔ migration 0001 applied.
    await db.run(sql`select count(*) as n from organization`);
    return Response.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - startedAt,
      app: "snap",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        status: "degraded",
        db: String(err instanceof Error ? err.message : err).slice(0, 200),
        latencyMs: Date.now() - startedAt,
        app: "snap",
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
