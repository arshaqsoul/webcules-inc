/* WEB-183 (Integrations 4/6) — explicit import sessions: open with the
 * picked files, close with per-file outcomes, idempotent close, tenant
 * isolation. (The bytes themselves never transit the Worker — browser
 * relay; this is the bookkeeping underneath.) */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import {
  completeImportSession,
  openImportSession,
} from "@/lib/repos/import-sessions";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("openImportSession", () => {
  it("records the picked files and file_count for a Drive selection", async () => {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const opened = await openImportSession({
      organizationId: s.organizationId,
      projectId: project,
      actorUserId: s.userId,
      source: "google_drive",
      files: [
        { driveFileId: "df1", name: "ceremony.jpg", sizeBytes: 1024 },
        { driveFileId: "df2", name: "raw.cr3" },
      ],
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const row = (
      await getDb().select().from(schema.importSessions).limit(1)
    )[0];
    expect(row.id).toBe(opened.id);
    expect(row.source).toBe("google_drive");
    expect(row.status).toBe("open");
    expect(row.fileCount).toBe(2);
    expect(JSON.parse(row.picked)).toEqual([
      { driveFileId: "df1", name: "ceremony.jpg", sizeBytes: 1024 },
      { driveFileId: "df2", name: "raw.cr3" },
    ]);
  });

  it("rejects unknown sources and malformed file lists", async () => {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    await expect(
      openImportSession({
        organizationId: s.organizationId,
        projectId: project,
        actorUserId: s.userId,
        source: "dropbox",
        files: [{ driveFileId: "x", name: "a.jpg" }],
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_source" });
    await expect(
      openImportSession({
        organizationId: s.organizationId,
        projectId: project,
        actorUserId: s.userId,
        source: "google_drive",
        files: [],
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_files" });
    await expect(
      openImportSession({
        organizationId: s.organizationId,
        projectId: project,
        actorUserId: s.userId,
        source: "google_drive",
        files: [{ driveFileId: "", name: "a.jpg" }],
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_files" });
    // duplicate drive ids are not a valid selection either
    await expect(
      openImportSession({
        organizationId: s.organizationId,
        projectId: project,
        actorUserId: s.userId,
        source: "google_drive",
        files: [
          { driveFileId: "same", name: "a.jpg" },
          { driveFileId: "same", name: "b.jpg" },
        ],
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_files" });
  });
});

describe("completeImportSession", () => {
  async function openSession() {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const opened = await openImportSession({
      organizationId: s.organizationId,
      projectId: project,
      actorUserId: s.userId,
      source: "google_drive",
      files: [
        { driveFileId: "a", name: "a.jpg" },
        { driveFileId: "b", name: "b.jpg" },
        { driveFileId: "c", name: "c.jpg" },
      ],
    });
    if (!opened.ok) throw new Error("open failed");
    return { s, project, id: opened.id };
  }

  it("folds outcomes into counts and writes the detail JSON", async () => {
    const { s, project, id } = await openSession();
    const closed = await completeImportSession({
      organizationId: s.organizationId,
      projectId: project,
      sessionId: id,
      entries: [
        { driveFileId: "a", outcome: "imported" },
        { driveFileId: "b", outcome: "skipped_duplicate" },
        { driveFileId: "c", outcome: "failed" },
      ],
    });
    expect(closed).toEqual({ ok: true, id, imported: 1, skipped: 1, failed: 1 });
    const row = (await getDb().select().from(schema.importSessions).limit(1))[0];
    expect(row.status).toBe("complete");
    expect(row.importedCount).toBe(1);
    expect(row.skippedCount).toBe(1);
    expect(row.failedCount).toBe(1);
    expect(row.completedAt).not.toBeNull();
  });

  it("close is idempotent — a retried PATCH returns the recorded counts", async () => {
    const { s, project, id } = await openSession();
    const first = await completeImportSession({
      organizationId: s.organizationId,
      projectId: project,
      sessionId: id,
      entries: [{ driveFileId: "a", outcome: "imported" }],
    });
    const second = await completeImportSession({
      organizationId: s.organizationId,
      projectId: project,
      sessionId: id,
      entries: [
        { driveFileId: "a", outcome: "failed" },
        { driveFileId: "b", outcome: "failed" },
        { driveFileId: "c", outcome: "failed" },
      ],
    });
    expect(second).toEqual(first);
    const row = (await getDb().select().from(schema.importSessions).limit(1))[0];
    expect(row.importedCount).toBe(1);
    expect(row.failedCount).toBe(0);
  });

  it("rejects unknown/garbage outcomes and foreign sessions", async () => {
    const { s, project, id } = await openSession();
    await expect(
      completeImportSession({
        organizationId: s.organizationId,
        projectId: project,
        sessionId: id,
        entries: [],
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_entries" });
    await expect(
      completeImportSession({
        organizationId: s.organizationId,
        projectId: project,
        sessionId: "does-not-exist",
        entries: [{ driveFileId: "a", outcome: "imported" }],
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    // another org cannot close this studio's session
    const other = await seedStudio({ name: "Other" });
    await expect(
      completeImportSession({
        organizationId: other.organizationId,
        projectId: project,
        sessionId: id,
        entries: [{ driveFileId: "a", outcome: "imported" }],
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
  });
});
