/* classifyUpload + sniffKind — the upload type gate's source of truth. */
import { describe, expect, it } from "vitest";

import { classifyUpload } from "@/lib/repos/assets";
import { sniffKind } from "@/lib/uploads";

const RAW_EXTS = [
  "cr2", "cr3", "nef", "nrw", "arw", "srf", "sr2", "mrw", "raf", "orf", "rw2",
  "raw", "rwl", "lfr", "pef", "x3f", "3fr", "fff", "iiq", "mef", "erf", "kdc",
  "dcr", "mos", "srw", "gpr", "dng",
];

describe("classifyUpload", () => {
  it.each(RAW_EXTS)("classifies .%s as raw", (ext) => {
    expect(classifyUpload(`keeper.${ext}`)).toEqual({ ext, kind: "raw" });
  });

  it("is case-insensitive", () => {
    expect(classifyUpload("KEEPER.NEF")?.kind).toBe("raw");
    expect(classifyUpload("Photo.JPG")?.kind).toBe("image");
  });

  it("classifies images and videos", () => {
    for (const ext of ["jpg", "jpeg", "png", "webp", "avif", "heic", "gif"]) {
      expect(classifyUpload(`x.${ext}`)?.kind).toBe("image");
    }
    for (const ext of ["mp4", "mov", "webm"]) {
      expect(classifyUpload(`x.${ext}`)?.kind).toBe("video");
    }
  });

  it("rejects unknown extensions (no 'other' leaks through the gate)", () => {
    expect(classifyUpload("archive.zip")).toBeNull();
    expect(classifyUpload("doc.pdf")).toBeNull();
    expect(classifyUpload("script.exe")).toBeNull();
    expect(classifyUpload("noext")).toBeNull();
  });
});

describe("sniffKind (magic bytes)", () => {
  const bytes = (...arr: number[]) => new Uint8Array(arr);

  it("detects jpeg/png/gif/webp", () => {
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image");
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("image");
    expect(sniffKind(bytes(0x47, 0x49, 0x46, 0x38))).toBe("image");
    expect(sniffKind(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image");
  });

  it("detects TIFF-based RAW (II*/MM* covers every brand but Sigma/CR3)", () => {
    expect(sniffKind(bytes(0x49, 0x49, 0x2a, 0x00))).toBe("raw");
    expect(sniffKind(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe("raw");
  });

  it("detects Sigma X3F (FOVb) and Canon CR3 (ftyp cr3x)", () => {
    expect(sniffKind(bytes(0x46, 0x4f, 0x56, 0x62))).toBe("raw");
    expect(sniffKind(bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x63, 0x72, 0x33, 0x00))).toBe("raw");
  });

  it("detects video containers", () => {
    // isom/mp42/qt brands through ftyp, plus WebM/Matroska
    expect(sniffKind(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d))).toBe("video");
    expect(sniffKind(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("video");
  });

  it("returns null for unknown payloads (no false positives)", () => {
    expect(sniffKind(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffKind(bytes())).toBeNull();
  });
});
