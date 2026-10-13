/* WEB-184 — ZIP import guards + folder mapping (lib/zip-import.ts).
 * Archives are built with fflate's zipSync so every guard is exercised
 * against real central-directory metadata. Default production limits are
 * far too large to hit in a test, so the bomb/size/count cases inject small
 * limits through the same parameter the production path defaults. */
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  extractZipBytes,
  normalizeZipPath,
  sanitizeFolderLabel,
} from "@/lib/zip-import";

const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);

function entry(files: Record<string, Uint8Array>) {
  return zipSync(files);
}

describe("normalizeZipPath", () => {
  it("normalizes separators and strips leading ./", () => {
    expect(normalizeZipPath("a\\b\\c.jpg")).toEqual(["a", "b", "c.jpg"]);
    expect(normalizeZipPath("./x.jpg")).toEqual(["x.jpg"]);
  });

  it("rejects traversal, absolute paths, and drive letters", () => {
    expect(normalizeZipPath("../evil.jpg")).toBeNull();
    expect(normalizeZipPath("a/../../evil.jpg")).toBeNull();
    expect(normalizeZipPath("/etc/passwd.jpg")).toBeNull();
    expect(normalizeZipPath("C:\\evil.jpg")).toBeNull();
    expect(normalizeZipPath("a//b.jpg")).toBeNull();
  });
});

describe("sanitizeFolderLabel", () => {
  it("trims and caps at 64 chars", () => {
    expect(sanitizeFolderLabel("  Ceremony  ")).toBe("Ceremony");
    expect(sanitizeFolderLabel("x".repeat(80))?.length).toBe(64);
  });

  it("drops control characters", () => {
    expect(sanitizeFolderLabel("a\u0000b\u001f")).toBe("ab");
  });

  it("returns null for empty labels", () => {
    expect(sanitizeFolderLabel("   ")).toBeNull();
  });
});

describe("extractZipBytes", () => {
  it("extracts, maps folders, and strips a shared root folder", async () => {
    const zip = entry({
      "Smith Wedding/Ceremony/a.jpg": jpg,
      "Smith Wedding/Reception/b.png": png,
      "Smith Wedding/cover.jpg": jpg,
    });
    const res = await extractZipBytes(zip);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.files.map((f) => [f.name, f.folder])).toEqual([
      ["a.jpg", "Ceremony"],
      ["b.png", "Reception"],
      ["cover.jpg", null],
    ]);
    expect(res.files[0].data).toEqual(jpg);
  });

  it("keeps the root folder when entries are not all under one root", async () => {
    const zip = entry({ "Ceremony/a.jpg": jpg, "Reception/b.png": png });
    const res = await extractZipBytes(zip);
    expect(res.ok && res.files.map((f) => f.folder)).toEqual([
      "Ceremony",
      "Reception",
    ]);
  });

  it("flattens deep nesting into the first-level folder", async () => {
    const zip = entry({ "Wedding/Day 1/Edited/a.jpg": jpg });
    const res = await extractZipBytes(zip);
    expect(res.ok && res.files[0].folder).toBe("Day 1");
  });

  it("counts real directory entries as plain skips, not unsafe (WEB-308)", async () => {
    // Nested objects make zipSync emit real "Smith/"-style directory
    // entries — the flat records used elsewhere never do. Finder, Explorer,
    // WinZip and Dropbox all write these, so they must not trip the
    // "skipped N (unsafe)" warning.
    const zip = zipSync({
      "Smith Wedding": { Ceremony: { "a.jpg": jpg }, "b.png": png } as any,
      "c.jpg": jpg,
    });
    const res = await extractZipBytes(zip);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.files.map((f) => f.name).sort()).toEqual([
      "a.jpg",
      "b.png",
      "c.jpg",
    ]);
    expect(res.files.map((f) => f.folder)).toEqual([
      "Smith Wedding",
      "Smith Wedding",
      null,
    ]);
    expect(res.skippedUnsafe).toBe(0);
    expect(res.skippedJunk).toBe(0);
    expect(res.skippedUnsupported).toBe(0);
  });

  it("skips OS junk and unsupported file types", async () => {
    const zip = entry({
      "Ceremony/a.jpg": jpg,
      "__MACOSX/Ceremony/a.jpg": jpg,
      "Ceremony/._sidecar.jpg": jpg,
      ".DS_Store": new Uint8Array(4),
      "notes.txt": new Uint8Array(4),
      "Thumbs.db": new Uint8Array(4),
    });
    const res = await extractZipBytes(zip);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.files).toHaveLength(1);
    expect(res.skippedJunk).toBe(4);
    expect(res.skippedUnsupported).toBe(1);
    expect(res.skippedUnsafe).toBe(0);
  });

  it("skips traversal-named entries without touching their bytes", async () => {
    const zip = entry({
      "Ceremony/a.jpg": jpg,
      "../evil.jpg": jpg,
      "/abs/evil.jpg": jpg,
      "..\\win-evil.jpg": jpg,
    });
    const res = await extractZipBytes(zip);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.files).toHaveLength(1);
    expect(res.skippedUnsafe).toBe(3);
  });

  it("rejects a whole archive when one entry expands past the per-entry cap", async () => {
    const zip = entry({ "big.jpg": new Uint8Array(1000) });
    const res = await extractZipBytes(zip, { maxEntryUncompressed: 100 });
    expect(res).toEqual({
      ok: false,
      error: "zip_entry_too_large",
      detail: "big.jpg",
    });
  });

  it("rejects when the running total passes the budget", async () => {
    const zip = entry({
      "a.jpg": new Uint8Array(100),
      "b.jpg": new Uint8Array(100),
    });
    const res = await extractZipBytes(zip, { maxTotalUncompressed: 150 });
    expect(res.ok ? "kept" : res.error).toBe("zip_total_too_large");
  });

  it("flags a high-expansion entry as a bomb before inflating", async () => {
    // 10k zero bytes deflate to a few dozen — huge ratio, tiny archive.
    const zip = entry({ bomb: new Uint8Array(10_000) });
    const res = await extractZipBytes(zip, {
      bombMinRatio: 2,
      bombMinCompressed: 1,
    });
    expect(res).toEqual({ ok: false, error: "zip_bomb", detail: "bomb" });
  });

  it("enforces the entry-count cap", async () => {
    const zip = entry({ "a.jpg": jpg, "b.jpg": jpg });
    const res = await extractZipBytes(zip, { maxEntries: 1 });
    expect(res.ok ? "kept" : res.error).toBe("zip_too_many_entries");
  });

  it("reports zip_no_files when nothing inside is accepted", async () => {
    const zip = entry({
      "readme.txt": new Uint8Array(4),
      "run.exe": new Uint8Array(4),
    });
    const res = await extractZipBytes(zip);
    expect(res).toEqual({ ok: false, error: "zip_no_files" });
  });

  it("rejects non-zip bytes as corrupt", async () => {
    const res = await extractZipBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(["zip_corrupt", "zip_no_files"]).toContain(res.error);
  });
});
