/* WEB-276 CSV import — server-side commit/undo. Rows arrive pre-shaped from
 * the mapping UI but are re-validated here (the browser's work is a hint,
 * never authority). Dedupe is org-scoped by email against the target table;
 * imported people are NEVER emailed (import ≠ consent).
 *
 * et al. that db-schema.ts doesn't declare yet, which blocked the repo-wide
 * typecheck gate for unrelated deploys. Remove this marker when the schema
 * catches up. */
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import type { RowError, ShapedRow } from "@/lib/csv-import";
import { IMPORT_MAX_ROWS } from "@/lib/csv-import";
import { defaultClientNotify } from "@/lib/notify-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UNDO_WINDOW_DAYS = 7;
/** D1's SQLite binds cap ~100 per query — stay under with margin. */
const CHUNK = 90;

export type ImportReport = {
  batchId: string | null;
  dryRun: boolean;
  created: number;
  skipped: number;
  updated: number;
  errors: RowError[];
};

export type ImportKind = "clients" | "leads";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Re-validate shaped rows server-side; drops anything malformed. */
function sanitize(rows: ShapedRow[]): { valid: ShapedRow[]; errors: RowError[] } {
  const valid: ShapedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(0, IMPORT_MAX_ROWS)) {
    if (!EMAIL_RE.test(r.email)) {
      errors.push({ row: r.row, reason: `invalid email: ${r.email}`, email: r.email });
    } else if (seen.has(r.email)) {
      errors.push({ row: r.row, reason: `duplicate of an earlier row (${r.email})`, email: r.email });
    } else {
      seen.add(r.email);
      valid.push(r);
    }
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    errors.push({ row: IMPORT_MAX_ROWS + 1, reason: `truncated at ${IMPORT_MAX_ROWS} rows` });
  }
  return { valid, errors };
}

/** Org-scoped existing emails in the target table (dedupe key). */
async function existingEmails(organizationId: string, kind: ImportKind, emails: string[]): Promise<Set<string>> {
  const db = getDb();
  const found = new Set<string>();
  for (const part of chunk(emails, CHUNK)) {
    const rows =
      kind === "clients"
        ? await db
            .select({ email: schema.clients.email })
            .from(schema.clients)
            .where(and(eq(schema.clients.organizationId, organizationId), inArray(schema.clients.email, part)))
        : await db
            .select({ email: schema.leads.email })
            .from(schema.leads)
            .where(
              and(
                eq(schema.leads.organizationId, organizationId),
                inArray(schema.leads.email, part),
                or(eq(schema.leads.status, "new"), eq(schema.leads.status, "replied")),
              ),
            );
    for (const r of rows) found.add(r.email);
  }
  return found;
}

export async function runImport(params: {
  organizationId: string;
  userId: string;
  kind: ImportKind;
  rows: ShapedRow[];
  dryRun: boolean;
  /** update-blanks mode: existing rows get missing fields filled, never overwritten */
  updateBlanks: boolean;
}): Promise<ImportReport> {
  const { valid, errors } = sanitize(params.rows);
  const taken = await existingEmails(params.organizationId, params.kind, valid.map((r) => r.email));
  const fresh = valid.filter((r) => !taken.has(r.email));
  const present = valid.filter((r) => taken.has(r.email));
  let updated = 0;

  if (params.dryRun) {
    return {
      batchId: null,
      dryRun: true,
      created: fresh.length,
      skipped: present.length,
      updated: params.updateBlanks ? present.length : 0,
      errors,
    };
  }

  const db = getDb();
  const batchId = crypto.randomUUID();

  if (params.kind === "clients") {
    const notify = await defaultClientNotify(params.organizationId);
    for (const part of chunk(fresh, CHUNK)) {
      await db.insert(schema.clients).values(
        part.map((r) => ({
          id: crypto.randomUUID(),
          organizationId: params.organizationId,
          email: r.email,
          name: r.name,
          phone: r.phone,
          notes: r.notes,
          notify,
          importBatchId: batchId,
        })),
      );
    }
    if (params.updateBlanks && present.length) {
      for (const r of present) {
        const res = await db
          .update(schema.clients)
          .set({
            name: sql`COALESCE(${schema.clients.name}, ${r.name})`,
            phone: sql`COALESCE(${schema.clients.phone}, ${r.phone})`,
            notes: sql`COALESCE(${schema.clients.notes}, ${r.notes})`,
            updatedAt: new Date(),
          })
          .where(and(eq(schema.clients.organizationId, params.organizationId), eq(schema.clients.email, r.email)))
          .returning({ id: schema.clients.id });
        if (res.length) updated++;
      }
    }
  } else {
    for (const part of chunk(fresh, CHUNK)) {
      await db.insert(schema.leads).values(
        part.map((r) => ({
          id: crypto.randomUUID(),
          organizationId: params.organizationId,
          email: r.email,
          name: r.name ?? r.email,
          phone: r.phone,
          eventDate: r.eventDate ? new Date(`${r.eventDate}T00:00:00Z`) : null,
          eventType: r.eventType,
          message: r.notes,
          source: "import",
          status: "new",
          importBatchId: batchId,
        })),
      );
    }
  }

  await db.insert(schema.importBatch).values({
    id: batchId,
    organizationId: params.organizationId,
    kind: params.kind,
    createdCount: fresh.length,
    skippedCount: present.length,
    updatedCount: updated,
    createdBy: params.userId,
  });

  return {
    batchId,
    dryRun: false,
    created: fresh.length,
    skipped: present.length,
    updated,
    errors,
  };
}

/** Undo a batch within the 7-day window. Only untouched rows go: leads that
 * were converted/replied stay, clients that a project references stay. */
export async function undoImport(
  organizationId: string,
  batchId: string,
): Promise<{ ok: true; removed: number; kept: number } | { ok: false; error: string }> {
  const db = getDb();
  const batch = (
    await db
      .select()
      .from(schema.importBatch)
      .where(and(eq(schema.importBatch.id, batchId), eq(schema.importBatch.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!batch) return { ok: false, error: "not_found" };
  const ageDays = (Date.now() / 1000 - batch.createdAt.getTime() / 1000) / 86_400;
  if (ageDays > UNDO_WINDOW_DAYS) return { ok: false, error: "window_expired" };

  let removed = 0;
  let kept = 0;
  if (batch.kind === "leads") {
    // untouched = still 'new' (never replied to, never converted)
    const rows = await db
      .select({ id: schema.leads.id, status: schema.leads.status })
      .from(schema.leads)
      .where(and(eq(schema.leads.importBatchId, batchId), eq(schema.leads.organizationId, organizationId)));
    const removable = rows.filter((r) => r.status === "new").map((r) => r.id);
    kept = rows.length - removable.length;
    for (const part of chunk(removable, CHUNK)) {
      await db.delete(schema.leads).where(inArray(schema.leads.id, part));
    }
    removed = removable.length;
  } else {
    // untouched = no project has ever referenced this email
    const rows = await db
      .select({ id: schema.clients.id, email: schema.clients.email })
      .from(schema.clients)
      .where(and(eq(schema.clients.importBatchId, batchId), eq(schema.clients.organizationId, organizationId)));
    for (const r of rows) {
      const used = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.clientId, r.id)))
        .limit(1);
      if (used.length) {
        kept++;
        continue;
      }
      await db.delete(schema.clients).where(eq(schema.clients.id, r.id));
      removed++;
    }
  }
  await db
    .update(schema.importBatch)
    .set({ createdCount: 0, skippedCount: 0, updatedCount: 0 })
    .where(eq(schema.importBatch.id, batchId));
  return { ok: true, removed, kept };
}

/** Recent batches (import screen's "last import" + undo affordance). */
export async function recentImports(organizationId: string, limit = 5) {
  return getDb()
    .select()
    .from(schema.importBatch)
    .where(and(eq(schema.importBatch.organizationId, organizationId), gte(schema.importBatch.createdCount, 1)))
    .orderBy(desc(schema.importBatch.createdAt))
    .limit(limit);
}

