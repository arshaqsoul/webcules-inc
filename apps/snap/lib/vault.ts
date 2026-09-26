/* RAW Vault (WEB-153) — the RAW retention lifecycle.
 *
 * RAWs stay hot for 6 months (renewal notice at month 5), then move to R2
 * Infrequent Access where they remain fully downloadable and restorable.
 * Permanent deletion happens ONLY for archived RAWs 90+ days old whose
 * warnings were emailed twice (day 60 and day 80 of the archive window);
 * assets inside an effectively-active share grant are never purged. JPGs and
 * every other kind are untouched by this module.
 *
 * All vault columns are epoch SECONDS; null = stage not reached. */
import { and, eq, inArray, isNull, isNotNull, lte } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { sendEmail, rawArchivedEmail, rawPurgeWarningEmail, rawRenewalEmail } from "./email";
import { getStudioProfile } from "./repos/studios";
import { safeHexColor } from "./embed";
import { deleteAsset, assetProtectedByGrant } from "./repos/assets";
import { toInfrequentAccess, toStandard } from "./storage/r2s3";

const DAY = 86400;
/** Hot window before first archive eligibility (spec: 6 months). */
export const HOT_DAYS = 180;
/** Renewal notice sent this many days after upload (spec: month 5). */
export const NOTICE_DAYS = 150;
/** Grace between final notice and the move, so the month-5 email can land. */
export const NOTICE_GRACE_DAYS = 3;
/** Purge warnings at day 60 + 80 of the archive window; deletion at day 90. */
export const PURGE_WARN1_DAYS = 60;
export const PURGE_WARN2_DAYS = 80;
export const PURGE_AFTER_DAYS = 90;
/** Days after the final warning before the purge may actually run. */
export const PURGE_FINAL_GRACE_DAYS = 10;

type RawAsset = typeof schema.assets.$inferSelect;

/** When this RAW's hot window ends (upload + 180d, extended by keep/restore). */
export function hotDeadline(a: Pick<RawAsset, "createdAt" | "rawKeepUntil">): number {
  const base = Math.floor(a.createdAt.getTime() / 1000) + HOT_DAYS * DAY;
  return Math.max(base, a.rawKeepUntil ?? 0);
}

function fmtBytes(b: number): string {
  return `${(b / 1024 ** 3).toFixed(1)}GB`;
}
function fmtDate(s: number): string {
  return new Date(s * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function projectTitles(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const db = getDb();
  const rows = await db
    .select({ id: schema.projects.id, title: schema.projects.title })
    .from(schema.projects)
    .where(inArray(schema.projects.id, ids));
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** One rolled-up email per org (stages batch many assets); stamping happens
 * in the stage runner. Contact email unset ⇒ counted, not emailed. */
async function emailStage(
  orgId: string,
  assets: RawAsset[],
  render: (p: { studioName: string; accent: string; vaultUrl: string; bytes: number; projects: string[]; count: number }) =>
    { subject: string; html: string; text: string },
  template: string,
): Promise<boolean> {
  const profile = await getStudioProfile(orgId);
  if (!profile?.contactEmail) return false;
  const titles = await projectTitles([...new Set(assets.map((a) => a.projectId))]);
  const tmpl = render({
    studioName: profile.studioName,
    accent: safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2",
    vaultUrl: "https://snap.webcules.com/dashboard/raw-vault",
    bytes: assets.reduce((n, a) => n + a.bytes, 0),
    projects: [...new Set(assets.map((a) => titles.get(a.projectId) ?? "a project"))],
    count: assets.length,
  });
  try {
    await sendEmail({
      to: profile.contactEmail,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      organizationId: orgId,
      template,
    });
    return true;
  } catch {
    return false; // stage stamps stay unset ⇒ retried next day
  }
}

async function auditProject(organizationId: string, projectId: string, action: string, meta: Record<string, unknown>) {
  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    action,
    targetType: "project",
    targetId: projectId,
    meta: JSON.stringify(meta),
  });
}

export type SweepResult = {
  noticed: number;
  archived: number;
  purgeWarned: number;
  purgeFinalWarned: number;
  purged: number;
  skippedShared: number;
  movedFailed: number;
  moveError: string | null;
};

/** Daily RAW lifecycle sweep — runs inside the daily-status cron. Each stage
 * advances rows monotonically; every destructive step is preceded by its
 * emailed warnings. */
export async function runRawVaultSweep(): Promise<SweepResult> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const out: SweepResult = { noticed: 0, archived: 0, purgeWarned: 0, purgeFinalWarned: 0, purged: 0, skippedShared: 0, movedFailed: 0, moveError: null };

  // Stage 1 — month-5 renewal notice (email first; stamp only on success).
  const noticeDue = await db
    .select()
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.kind, "raw"),
        isNull(schema.assets.rawArchivedAt),
        isNull(schema.assets.rawNoticeAt),
        lte(schema.assets.createdAt, new Date((now - NOTICE_DAYS * DAY) * 1000)),
      ),
    )
    .limit(500);
  if (noticeDue.length) {
    const byOrg = new Map<string, RawAsset[]>();
    for (const a of noticeDue) byOrg.set(a.organizationId, [...(byOrg.get(a.organizationId) ?? []), a]);
    const stamped: string[] = [];
    for (const [orgId, group] of byOrg) {
      const sent = await emailStage(orgId, group, (p) =>
        rawRenewalEmail(p.studioName, {
          accent: p.accent,
          vaultUrl: p.vaultUrl,
          count: p.count,
          bytesLabel: fmtBytes(p.bytes),
          projectNames: p.projects,
          archiveOn: fmtDate(Math.min(...group.map(hotDeadline))),
        }),
      "raw.renewal_notice",
      );
      if (sent) stamped.push(...group.map((a) => a.id));
    }
    if (stamped.length) {
      await db.update(schema.assets).set({ rawNoticeAt: now }).where(inArray(schema.assets.id, stamped));
      out.noticed = stamped.length;
    }
  }

  // Stage 2 — archive to Infrequent Access once the hot window ended.
  const archiveDue = (
    await db
      .select()
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.kind, "raw"),
          isNull(schema.assets.rawArchivedAt),
          isNotNull(schema.assets.rawNoticeAt),
          lte(schema.assets.rawNoticeAt, now - NOTICE_GRACE_DAYS * DAY),
        ),
      )
      .limit(200)
  ).filter((a) => hotDeadline(a) <= now);
  const archivedIds: string[] = [];
  const archivedByOrg = new Map<string, RawAsset[]>();
  const archivedByProject = new Map<string, number>();
  for (const a of archiveDue) {
    try {
      await toInfrequentAccess(a.organizationId, a.storageKey);
      archivedIds.push(a.id);
      archivedByOrg.set(a.organizationId, [...(archivedByOrg.get(a.organizationId) ?? []), a]);
      archivedByProject.set(a.projectId, (archivedByProject.get(a.projectId) ?? 0) + 1);
    } catch (e) {
      out.movedFailed++; // retried next run — row stays hot, nothing lost
      out.moveError = e instanceof Error ? e.message : String(e);
      console.error(`raw vault archive move failed (${a.filename}):`, out.moveError);
    }
  }
  if (archivedIds.length) {
    await db.update(schema.assets).set({ rawArchivedAt: now }).where(inArray(schema.assets.id, archivedIds));
    for (const [projectId, n] of archivedByProject) {
      const orgId = archiveDue.find((a) => a.projectId === projectId)!.organizationId;
      await auditProject(orgId, projectId, "asset.raw_archive", { n, system: true });
    }
    for (const [orgId, group] of archivedByOrg) {
      await emailStage(orgId, group, (p) =>
        rawArchivedEmail(p.studioName, {
          accent: p.accent,
          vaultUrl: p.vaultUrl,
          count: p.count,
          bytesLabel: fmtBytes(p.bytes),
          projectNames: p.projects,
          deleteOn: fmtDate(now + PURGE_AFTER_DAYS * DAY),
        }),
      "raw.archived",
      );
    }
    out.archived = archivedIds.length;
  }

  // Stages 3+4 — purge warnings (day 60 + day 80). Shared assets are excluded:
  // a live gallery must never see a deletion threat for its files.
  for (const [stage, days, stampCol, isFinal] of [
    ["warn1", PURGE_WARN1_DAYS, "rawPurgeWarn1At", false],
    ["warn2", PURGE_WARN2_DAYS, "rawPurgeWarn2At", true],
  ] as const) {
    const due = (
      await db
        .select()
        .from(schema.assets)
        .where(
          and(
            eq(schema.assets.kind, "raw"),
            isNotNull(schema.assets.rawArchivedAt),
            lte(schema.assets.rawArchivedAt, now - days * DAY),
            isNull(schema.assets[stampCol]),
          ),
        )
        .limit(500)
    );

    const eligible: RawAsset[] = [];
    for (const a of due) {
      if (!(await assetProtectedByGrant(a.id))) eligible.push(a);
      else out.skippedShared++;
    }

    if (eligible.length) {
      const byOrg = new Map<string, RawAsset[]>();
      for (const a of eligible) byOrg.set(a.organizationId, [...(byOrg.get(a.organizationId) ?? []), a]);
      const stamped: string[] = [];
      for (const [orgId, group] of byOrg) {
        const sent = await emailStage(orgId, group, (p) =>
          rawPurgeWarningEmail(p.studioName, {
            final: isFinal,
            accent: p.accent,
            vaultUrl: p.vaultUrl,
            count: p.count,
            bytesLabel: fmtBytes(p.bytes),
            projectNames: p.projects,
            deleteOn: fmtDate(Math.min(...group.map((a) => (a.rawArchivedAt ?? 0) + PURGE_AFTER_DAYS * DAY))),
          }),
        isFinal ? "raw.purge_final_warning" : "raw.purge_warning",
        );
        if (sent) stamped.push(...group.map((a) => a.id));
      }
      if (stamped.length) {
        const set: Record<string, number> = { [stampCol]: now };
        await db.update(schema.assets).set(set).where(inArray(schema.assets.id, stamped));
        if (isFinal) out.purgeFinalWarned = stamped.length;
        else out.purgeWarned = stamped.length;
      }
    }
  }

  // Stage 5 — purge. Only after BOTH warnings landed and a final grace;
  // share-protected assets are skipped silently and re-checked next run.
  const purgeDue = await db
    .select()
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.kind, "raw"),
        isNotNull(schema.assets.rawArchivedAt),
        lte(schema.assets.rawArchivedAt, now - PURGE_AFTER_DAYS * DAY),
        isNotNull(schema.assets.rawPurgeWarn2At),
        lte(schema.assets.rawPurgeWarn2At, now - PURGE_FINAL_GRACE_DAYS * DAY),
      ),
    )
    .limit(200);
  const purgedByProject = new Map<string, { orgId: string; n: number }>();
  for (const a of purgeDue) {
    if (await assetProtectedByGrant(a.id)) {
      out.skippedShared++;
      continue;
    }
    const r = await deleteAsset(a.organizationId, a.id);
    if (r.ok) {
      const agg = purgedByProject.get(a.projectId) ?? { orgId: a.organizationId, n: 0 };
      agg.n++;
      purgedByProject.set(a.projectId, agg);
    }
  }
  for (const [projectId, agg] of purgedByProject) {
    await auditProject(agg.orgId, projectId, "asset.raw_purge", { n: agg.n, system: true });
  }
  out.purged = [...purgedByProject.values()].reduce((n, p) => n + p.n, 0);

  return out;
}

/* ---------------- Studio-facing restore / keep-hot ---------------- */

export type RestoreResult = {
  restored: number;
  extended: number;
  skipped: number;
  failures: { id: string; filename: string; error: string }[];
};

/** Restore archived RAWs to Standard (and extend the hot window of any others
 * in scope) — the dashboard "renewal" action. One explicit call keeps RAWs
 * hot for another 6 months. */
export async function restoreRawAssets(
  organizationId: string,
  scope: { assetIds?: string[]; projectId?: string; all?: boolean },
  actorUserId: string,
): Promise<RestoreResult> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const conditions = [eq(schema.assets.organizationId, organizationId), eq(schema.assets.kind, "raw")];
  if (scope.assetIds?.length) conditions.push(inArray(schema.assets.id, scope.assetIds));
  else if (scope.projectId) conditions.push(eq(schema.assets.projectId, scope.projectId));
  else if (!scope.all) return { restored: 0, extended: 0, skipped: 0, failures: [] };

  const rows = await db.select().from(schema.assets).where(and(...conditions)).limit(1000);
  const out: RestoreResult = { restored: 0, extended: 0, skipped: 0, failures: [] };
  const byProject = new Map<string, { restored: number; extended: number }>();

  for (const a of rows) {
    if (a.rawArchivedAt) {
      try {
        await toStandard(organizationId, a.storageKey);
        await db
          .update(schema.assets)
          .set({ rawArchivedAt: null, rawKeepUntil: now + HOT_DAYS * DAY, rawNoticeAt: null, rawPurgeWarn1At: null, rawPurgeWarn2At: null })
          .where(eq(schema.assets.id, a.id));
        out.restored++;
        const agg = byProject.get(a.projectId) ?? { restored: 0, extended: 0 };
        agg.restored++;
        byProject.set(a.projectId, agg);
      } catch (e) {
        out.failures.push({ id: a.id, filename: a.filename, error: e instanceof Error ? e.message : "move failed" });
      }
    } else {
      // Hot RAW: an explicit act counts as renewal even before the notice window.
      await db
        .update(schema.assets)
        .set({ rawKeepUntil: now + HOT_DAYS * DAY, rawNoticeAt: null })
        .where(eq(schema.assets.id, a.id));
      out.extended++;
      const agg = byProject.get(a.projectId) ?? { restored: 0, extended: 0 };
      agg.extended++;
      byProject.set(a.projectId, agg);
    }
  }
  out.skipped = rows.length - out.restored - out.extended - out.failures.length;

  for (const [projectId, agg] of byProject) {
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      action: "asset.raw_restore",
      targetType: "project",
      targetId: projectId,
      meta: JSON.stringify({ ...agg, by: actorUserId }),
    });
  }
  return out;
}

/* ---------------- Vault summary (dashboard page) ---------------- */

export type VaultProjectRow = {
  projectId: string;
  title: string;
  hotCount: number;
  hotBytes: number;
  archivedCount: number;
  archivedBytes: number;
  /** earliest upcoming lifecycle timestamp + what happens then */
  nextAt: number | null;
  nextEvent: "notice" | "archive" | "purge" | null;
};

export async function getRawVaultSummary(organizationId: string): Promise<{
  projects: VaultProjectRow[];
  totals: { hotCount: number; hotBytes: number; archivedCount: number; archivedBytes: number };
  nextPurgeAt: number | null;
}> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const rows = await db
    .select({
      id: schema.assets.id,
      projectId: schema.assets.projectId,
      bytes: schema.assets.bytes,
      createdAt: schema.assets.createdAt,
      rawArchivedAt: schema.assets.rawArchivedAt,
      rawKeepUntil: schema.assets.rawKeepUntil,
      rawNoticeAt: schema.assets.rawNoticeAt,
    })
    .from(schema.assets)
    .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.kind, "raw")))
    .limit(2000);
  const titles = await projectTitles([...new Set(rows.map((r) => r.projectId))]);

  const map = new Map<string, VaultProjectRow>();
  for (const r of rows) {
    const row =
      map.get(r.projectId) ??
      { projectId: r.projectId, title: titles.get(r.projectId) ?? "Untitled project", hotCount: 0, hotBytes: 0, archivedCount: 0, archivedBytes: 0, nextAt: null, nextEvent: null };
    if (r.rawArchivedAt) {
      row.archivedCount++;
      row.archivedBytes += r.bytes;
      const purgeAt = r.rawArchivedAt + PURGE_AFTER_DAYS * DAY;
      if (purgeAt > now && (row.nextEvent !== "purge" || purgeAt < (row.nextAt ?? Infinity))) {
        row.nextAt = purgeAt;
        row.nextEvent = "purge";
      }
    } else {
      row.hotCount++;
      row.hotBytes += r.bytes;
      const deadline = hotDeadline(r);
      const event = r.rawNoticeAt ? "archive" : "notice";
      if (deadline > now && (row.nextEvent === null || row.nextEvent === "purge" || deadline < row.nextAt!)) {
        if (row.nextEvent !== "archive" || deadline < row.nextAt!) {
          row.nextAt = deadline;
          row.nextEvent = event;
        }
      }
    }
    map.set(r.projectId, row);
  }
  const projects = [...map.values()].sort((a, b) => b.archivedCount - a.archivedCount || b.hotCount - a.hotCount);
  const nextPurgeAt = projects.filter((p) => p.nextEvent === "purge" && p.nextAt).map((p) => p.nextAt!).sort((a, b) => a - b)[0] ?? null;
  return {
    projects,
    totals: {
      hotCount: projects.reduce((n, p) => n + p.hotCount, 0),
      hotBytes: projects.reduce((n, p) => n + p.hotBytes, 0),
      archivedCount: projects.reduce((n, p) => n + p.archivedCount, 0),
      archivedBytes: projects.reduce((n, p) => n + p.archivedBytes, 0),
    },
    nextPurgeAt,
  };
}
