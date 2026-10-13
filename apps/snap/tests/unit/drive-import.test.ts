/* WEB-183 (Integrations 4/6) — Google Drive import pure logic: app-id
 * derivation from the GIS client id, Picker-selection filtering (Google-
 * native docs, unsupported extensions, size cap, count cap), queue-state →
 * session-outcome mapping, and entry sanitizing shared with the server repo.
 * Browser/GIS/Picker code paths are thin wrappers verified by review, not
 * unit tests. */
import { describe, expect, it } from "vitest";

import {
  buildSessionEntries,
  DRIVE_IMPORT_MAX_FILES,
  driveAppId,
  filterPickedDocs,
  isGoogleNativeDoc,
  outcomeForQueueState,
  type DrivePickedDoc,
} from "@/lib/drive-import";

describe("driveAppId", () => {
  it("derives the numeric project id from a GIS client id", () => {
    expect(driveAppId("123456789012.apps.googleusercontent.com")).toBe(
      "123456789012",
    );
    expect(driveAppId("  42.apps.googleusercontent.com ")).toBe("42");
  });

  it("accepts the standard issued form <projectnumber>-<suffix> (WEB-325)", () => {
    // Google issues web client ids exclusively in this shape; the bare-numeric
    // form above is the legacy/other-client-type case.
    expect(
      driveAppId("606239879894-xk3js8fq1n2br7vc9d0e.apps.googleusercontent.com"),
    ).toBe("606239879894");
    expect(driveAppId("1-a.apps.googleusercontent.com")).toBe("1");
  });

  it("rejects anything that is not a client id", () => {
    expect(driveAppId("not-a-client-id")).toBeNull();
    expect(driveAppId("123.apps.googleusercontent.com.evil.example")).toBeNull();
    expect(driveAppId("606239879894-UPPER.apps.googleusercontent.com")).toBeNull();
    expect(driveAppId("606239879894-.apps.googleusercontent.com")).toBeNull();
    expect(driveAppId("")).toBeNull();
  });
});

describe("isGoogleNativeDoc", () => {
  it("flags folders and Docs/Sheets, not plain files", () => {
    expect(
      isGoogleNativeDoc({ name: "Folder", mimeType: "application/vnd.google-apps.folder" }),
    ).toBe(true);
    expect(
      isGoogleNativeDoc({ name: "Doc", mimeType: "application/vnd.google-apps.document" }),
    ).toBe(true);
    expect(isGoogleNativeDoc({ name: "a.jpg", mimeType: "image/jpeg" })).toBe(false);
    expect(isGoogleNativeDoc({ name: "a.cr2" })).toBe(false);
  });
});

describe("filterPickedDocs", () => {
  const photo = (over: Partial<DrivePickedDoc> = {}): DrivePickedDoc => ({
    id: "drive-1",
    name: "ceremony.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    ...over,
  });

  it("keeps photo/video/raw files Snap accepts", () => {
    const r = filterPickedDocs([
      photo(),
      photo({ id: "d2", name: "video.mp4", mimeType: "video/mp4" }),
      photo({ id: "d3", name: "raw.cr3" }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.files.map((f) => f.name)).toEqual([
        "ceremony.jpg",
        "video.mp4",
        "raw.cr3",
      ]);
      expect(r.skippedGoogleNative).toBe(0);
      expect(r.skippedUnsupported).toBe(0);
      expect(r.skippedTooLarge).toBe(0);
    }
  });

  it("skips Google-native docs and unsupported extensions with counts", () => {
    const r = filterPickedDocs([
      photo({ id: "g1", name: "Budget", mimeType: "application/vnd.google-apps.spreadsheet" }),
      photo({ id: "g2", name: "Folder", mimeType: "application/vnd.google-apps.folder" }),
      photo({ id: "u1", name: "setup.exe" }),
      photo({ id: "u2", name: "no-extension" }),
      photo(),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.files).toHaveLength(1);
      expect(r.skippedGoogleNative).toBe(2);
      expect(r.skippedUnsupported).toBe(2);
    }
  });

  it("skips files over the per-file cap (declared size, never downloaded)", () => {
    const r = filterPickedDocs([
      photo({ id: "big", name: "huge.mp4", sizeBytes: 5 * 1024 ** 3 + 1 }),
      photo({ id: "edge", name: "exact.mp4", sizeBytes: 5 * 1024 ** 3 }),
      photo({ id: "unk", name: "unknown-size.jpg" }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.files.map((f) => f.id)).toEqual(["edge", "unk"]);
      expect(r.skippedTooLarge).toBe(1);
    }
  });

  it("refuses selections over the file-count cap", () => {
    const many: DrivePickedDoc[] = Array.from({ length: DRIVE_IMPORT_MAX_FILES + 1 }, (_, i) =>
      photo({ id: `f${i}`, name: `f${i}.jpg` }),
    );
    const r = filterPickedDocs(many);
    expect(r).toMatchObject({ ok: false, error: "too_many_files" });
    // exactly at the cap passes
    expect(filterPickedDocs(many.slice(0, DRIVE_IMPORT_MAX_FILES)).ok).toBe(true);
  });

  it("caps long ids and names instead of rejecting them", () => {
    const r = filterPickedDocs([
      photo({ id: "x".repeat(400), name: "y".repeat(400) + ".jpg" }),
      photo({ id: "ok", name: "normal.jpg" }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // acceptance is judged on the ORIGINAL name; the stored copy is
      // clamped to the field caps but keeps its extension
      expect(r.files).toHaveLength(2);
      expect(r.files[0].id.length).toBe(128);
      expect(r.files[0].name.length).toBe(255);
      expect(r.files[0].name.endsWith(".jpg")).toBe(true);
      expect(r.files[1].name).toBe("normal.jpg");
    }
  });
});

describe("outcomeForQueueState", () => {
  it("maps queue states to session outcomes", () => {
    expect(outcomeForQueueState("done")).toBe("imported");
    expect(outcomeForQueueState("failed")).toBe("failed");
    expect(outcomeForQueueState("canceled", "Duplicate — skipped")).toBe(
      "skipped_duplicate",
    );
    expect(outcomeForQueueState("canceled")).toBe("skipped");
    expect(outcomeForQueueState("paused")).toBe("skipped");
  });
});

describe("buildSessionEntries", () => {
  it("drops blanks, duplicate ids, and unknown outcomes", () => {
    expect(
      buildSessionEntries([
        { driveFileId: "a", outcome: "imported" },
        { driveFileId: "a", outcome: "failed" },
        { driveFileId: "", outcome: "imported" },
        { driveFileId: "b", outcome: "nonsense" },
        { driveFileId: "c", outcome: "skipped_duplicate" },
      ]),
    ).toEqual([
      { driveFileId: "a", outcome: "imported" },
      { driveFileId: "c", outcome: "skipped_duplicate" },
    ]);
  });

  it("caps the entry count at the session limit", () => {
    const entries = Array.from({ length: DRIVE_IMPORT_MAX_FILES + 10 }, (_, i) => ({
      driveFileId: `f${i}`,
      outcome: "imported",
    }));
    expect(buildSessionEntries(entries)).toHaveLength(DRIVE_IMPORT_MAX_FILES);
  });
});
