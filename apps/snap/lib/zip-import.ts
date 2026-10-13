/* ZIP import (WEB-184) — client-side extraction with bomb/traversal guards
 * and folder mapping. Snap unzips archives in the browser BEFORE upload:
 * the Worker's 128 MB request cap and lack of ZIP64 support make server-side
 * unzip the wrong fight, and never shipping a .zip to the server makes
 * traversal structurally harmless — there is no server path to escape into.
 * Nothing here touches the network; the caller feeds the extracted Files
 * into the normal per-file upload queue.
 *
 * Guards (all enforced on the ZIP's DECLARED sizes in the central directory,
 * via fflate's filter, BEFORE any entry is inflated):
 *   - entry count cap            (a 100k-entry archive can OOM a tab alone)
 *   - per-entry uncompressed cap (zip bomb: one entry declaring 10 GB)
 *   - total uncompressed cap     (zip bomb: 10k entries × 500 MB)
 *   - compression-ratio sanity   (≥200:1 on a big entry is a bomb signature)
 *   - path traversal / absolute paths / junk entries are skipped by name
 *
 * Folder mapping: ZIP directories map to Snap's flat project folders. A
 * single shared root folder ("Smith Wedding/…" wrapping everything) is
 * stripped; the next path segment becomes the Snap folder name (sanitized to
 * the same rules lib/repos/folders.ts enforces, 64 chars max). Deeper
 * nesting flattens into that first-level folder. */
import { unzip } from "fflate";
import type { UnzipFileInfo } from "fflate";

import { classifyUpload } from "./upload-kinds";

export const ZIP_MAX_ENTRIES = 5_000;
/** Per-entry uncompressed cap — 2 GB (multipart handles the upload itself). */
export const ZIP_MAX_ENTRY_UNCOMPRESSED = 2 * 1024 ** 3;
/** Total uncompressed budget across all kept entries. */
export const ZIP_MAX_TOTAL_UNCOMPRESSED = 8 * 1024 ** 3;
/** A ≥200:1 ratio on an entry over 64 MB compressed is a bomb, not a photo. */
export const ZIP_BOMB_MIN_RATIO = 200;
export const ZIP_BOMB_MIN_COMPRESSED = 64 * 1024 * 1024;
/** Snap folder names cap (lib/repos/folders.ts MAX_NAME_LEN). */
export const FOLDER_NAME_MAX = 64;

export type ZipLimits = {
  maxEntries: number;
  maxEntryUncompressed: number;
  maxTotalUncompressed: number;
  bombMinRatio: number;
  bombMinCompressed: number;
};

const DEFAULT_LIMITS: ZipLimits = {
  maxEntries: ZIP_MAX_ENTRIES,
  maxEntryUncompressed: ZIP_MAX_ENTRY_UNCOMPRESSED,
  maxTotalUncompressed: ZIP_MAX_TOTAL_UNCOMPRESSED,
  bombMinRatio: ZIP_BOMB_MIN_RATIO,
  bombMinCompressed: ZIP_BOMB_MIN_COMPRESSED,
};

export type ZipExtractError =
  | "zip_corrupt"
  | "zip_too_many_entries"
  | "zip_entry_too_large"
  | "zip_total_too_large"
  | "zip_bomb"
  | "zip_no_files";

export type ZipEntry = {
  /** Sanitized file name (last path segment). */
  name: string;
  /** Snap folder label derived from the entry's directory, or null. */
  folder: string | null;
  data: Uint8Array;
};

export type ZipExtractResult =
  | {
      ok: true;
      files: ZipEntry[];
      /** Entries dropped as OS junk (__MACOSX, .DS_Store, …). */
      skippedJunk: number;
      /** Entries dropped for unsafe names (../, absolute, drive letters). */
      skippedUnsafe: number;
      /** Entries dropped because Snap doesn't accept that file type. */
      skippedUnsupported: number;
    }
  | { ok: false; error: ZipExtractError; detail?: string };

/** Normalize an entry name: forward slashes only, no leading "./" or "/".
 * Returns null for unsafe names (absolute paths, drive letters, ".."
 * segments) — those entries are skipped, never mangled. */
export function normalizeZipPath(raw: string): string[] | null {
  let name = raw.replace(/\\/g, "/");
  if (name.startsWith("/")) return null; // absolute path — never mangle it into relative
  if (/^[a-zA-Z]:/.test(name)) return null; // Windows drive letter
  name = name.replace(/^(\.\/)+/, "");
  if (!name) return null;
  const segments = name.split("/");
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  return segments;
}

const JUNK_BASENAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
const JUNK_PREFIX_DIRS = new Set([
  "__macosx",
  ".spotlight-v100",
  ".fseventsd",
  ".temporaryitems",
]);

function isJunk(segments: string[]): boolean {
  if (segments.some((s) => JUNK_PREFIX_DIRS.has(s.toLowerCase()))) return true;
  const base = segments[segments.length - 1].toLowerCase();
  if (JUNK_BASENAMES.has(base) || base.startsWith("._")) return true; // AppleDouble
  return false;
}

/** Sanitize a folder label with the same rules the server applies
 * (lib/repos/folders.ts): strip control chars, trim, cap length. */
export function sanitizeFolderLabel(raw: string): string | null {
  // Strip control chars (\u0000-\u001f, \u007f) without embedding them literally.
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c > 0x1f && c !== 0x7f;
    })
    .join("");
  const name = cleaned.trim().slice(0, FOLDER_NAME_MAX);
  return name.length ? name : null;
}

/** Map an entry's directory segments to a flat Snap folder label.
 * Strips one shared root folder when every entry has one; the next segment
 * (if any) becomes the folder name. Returns the per-entry label. */
function mapFolders(paths: string[][]): (string | null)[] {
  const stripRoot =
    paths.length > 0 &&
    paths.every((segs) => segs.length >= 2 && paths[0][0] === segs[0]);
  return paths.map((segs) => {
    const dir = stripRoot ? segs.slice(0, -1).slice(1) : segs.slice(0, -1);
    if (!dir.length) return null;
    return sanitizeFolderLabel(dir[0]);
  });
}

/** Extract + filter a ZIP held in memory. Pure (no DOM, no network) so it
 * runs in unit tests and workerd as well as the browser. `limits` exists for
 * tests; production callers use the exported defaults. */
export function extractZipBytes(
  data: Uint8Array,
  limits: Partial<ZipLimits> = {},
): Promise<ZipExtractResult> {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const kept: { info: UnzipFileInfo; segs: string[] }[] = [];
  const keptPaths: string[][] = [];
  let skippedJunk = 0;
  let skippedUnsafe = 0;
  let skippedUnsupported = 0;
  let totalBytes = 0;
  let hardError: { error: ZipExtractError; detail?: string } | null = null;

  const consider = (file: UnzipFileInfo): boolean => {
    if (hardError) return false;
    if (kept.length >= L.maxEntries) {
      hardError = {
        error: "zip_too_many_entries",
        detail: `more than ${L.maxEntries} entries`,
      };
      return false;
    }
    // Bomb guards — declared sizes from the central directory, checked
    // BEFORE fflate inflates anything (filter=false entries are skipped
    // without decompression).
    if (file.originalSize > L.maxEntryUncompressed) {
      hardError = { error: "zip_entry_too_large", detail: file.name };
      return false;
    }
    if (totalBytes + file.originalSize > L.maxTotalUncompressed) {
      hardError = {
        error: "zip_total_too_large",
        detail: `over ${L.maxTotalUncompressed} bytes total`,
      };
      return false;
    }
    if (
      file.size >= L.bombMinCompressed &&
      file.originalSize / Math.max(1, file.size) >= L.bombMinRatio
    ) {
      hardError = { error: "zip_bomb", detail: file.name };
      return false;
    }
    const segs = normalizeZipPath(file.name);
    if (!segs) {
      skippedUnsafe++;
      return false;
    }
    if (file.name.endsWith("/") || segs.length === 0) return false; // directory entry
    if (isJunk(segs)) {
      skippedJunk++;
      return false;
    }
    const last = segs[segs.length - 1];
    if (!classifyUpload(last)) {
      skippedUnsupported++;
      return false;
    }
    totalBytes += file.originalSize;
    kept.push({ info: file, segs });
    keptPaths.push(segs);
    return true;
  };

  return new Promise((resolve) => {
    let terminated = false;
    const finish = (
      err: unknown,
      unzipped: Record<string, Uint8Array> | null,
    ) => {
      if (terminated) return;
      terminated = true;
      if (hardError) {
        resolve({ ok: false, ...hardError });
        return;
      }
      if (err) {
        resolve({
          ok: false,
          error: "zip_corrupt",
          detail: String((err as Error)?.message ?? err),
        });
        return;
      }
      const folders = mapFolders(keptPaths);
      const files: ZipEntry[] = kept.map(({ segs }, i) => ({
        name: segs[segs.length - 1],
        folder: folders[i],
        data: unzipped![kept[i].info.name],
      }));
      if (!files.length) resolve({ ok: false, error: "zip_no_files" });
      else
        resolve({
          ok: true,
          files,
          skippedJunk,
          skippedUnsafe,
          skippedUnsupported,
        });
    };

    try {
      unzip(data, { filter: consider }, (err, unzipped) =>
        finish(err, unzipped),
      );
    } catch (err) {
      finish(err, null);
    }
  });
}

/** Extract a browser File. Returns ready-to-upload Files (named after their
 * archive entry) plus the folder each maps to — the caller's normal dedup
 * path (fingerprint at confirm) still applies to the extracted files. */
export async function extractZipFile(
  file: File,
  limits?: Partial<ZipLimits>,
): Promise<
  | {
      ok: true;
      files: { name: string; folder: string | null; file: File }[];
      skippedJunk: number;
      skippedUnsafe: number;
      skippedUnsupported: number;
    }
  | { ok: false; error: ZipExtractError; detail?: string }
> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const result = await extractZipBytes(buf, limits);
  if (!result.ok) return result;
  const type = file.type || "application/octet-stream";
  return {
    ...result,
    files: result.files.map((f) => ({
      name: f.name,
      folder: f.folder,
      // Bytes are copied because fflate's buffers may be views into the
      // single zip buffer; a standalone File keeps the queue's retry store
      // and slice()-based fingerprinting working.
      file: new File([f.data.slice().buffer as ArrayBuffer], f.name, {
        type: zipEntryMime(extOf(f.name), type),
      }),
    })),
  };
}

function extOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

function zipEntryMime(ext: string, fallback: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    bmp: "image/bmp",
    heic: "image/heic",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    pdf: "application/pdf",
  };
  return map[ext] ?? fallback;
}
