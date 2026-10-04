/* Streaming STORE-ZIP writer + part planner (downloads 3.0).
 *
 * The archive is generated on demand INTO the HTTP response - nothing is
 * stored in R2, no cron is involved, and memory stays bounded by one file
 * (JPEGs are buffered for the EXIF strip) regardless of gallery size.
 *
 * Why parts instead of ZIP64: a gallery that exceeds PART_BYTES is split
 * into several archives ("Part 1 of 6"). Every part stays under 4 GiB, so
 * it is a plain classic ZIP that opens everywhere (macOS Archive Utility,
 * Windows Explorer, Android/iOS Files) - ZIP64 support is patchy on phones.
 * A dropped connection also costs one part, not the whole wedding.
 *
 *  - STORE method: photos are already compressed; pure byte-copy.
 *  - Buffered entries (EXIF-stripped JPEGs) know size + CRC up front.
 *  - Streamed entries use a data descriptor (flag bit 3) with the CRC
 *    computed on the fly, so there is no second read pass. */

export const PART_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB per archive
export const PART_MAX_FILES = 10_000;
/** A classic ZIP entry cannot carry >= 4 GiB. */
export const ENTRY_MAX_BYTES = 0xffffffff;

/* ---------------- CRC-32 (slicing-by-8) ---------------- */

const CRC_TABLES = (() => {
  const t = new Int32Array(256 * 8);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  for (let i = 0; i < 256; i++) {
    let c = t[i];
    for (let s = 1; s < 8; s++) {
      c = t[c & 0xff] ^ (c >>> 8);
      t[s * 256 + i] = c;
    }
  }
  return t;
})();

/** Incremental CRC-32: pass the previous return value as `seed`. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  const T = CRC_TABLES;
  let c = ~seed;
  let i = 0;
  const n = bytes.length;
  for (; i + 8 <= n; i += 8) {
    const lo = c ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
    c =
      T[1792 + (lo & 0xff)] ^
      T[1536 + ((lo >>> 8) & 0xff)] ^
      T[1280 + ((lo >>> 16) & 0xff)] ^
      T[1024 + (lo >>> 24)] ^
      T[768 + bytes[i + 4]] ^
      T[512 + bytes[i + 5]] ^
      T[256 + bytes[i + 6]] ^
      T[bytes[i + 7]];
  }
  for (; i < n; i++) c = T[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/* ---------------- naming ---------------- */

/** Dedupe names inside the archive ("IMG_1.jpg" from two folders →
 * "Ceremony/IMG_1.jpg", duplicates get " (n)"). Control characters and
 * path separators in labels are neutralised so a name can never escape. */
export function allocateZipName(taken: Set<string>, folder: string | null, filename: string): string {
  const clean = (s: string) => s.replace(/[\\/]/g, "-").replace(/[\u0000-\u001f]/g, "").trim();
  const base = `${folder && clean(folder) ? `${clean(folder)}/` : ""}${clean(filename) || "file"}`;
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > base.lastIndexOf("/") + 1 ? base.slice(0, dot) : base;
  const ext = stem === base ? "" : base.slice(dot);
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/* ---------------- part planning (pure) ---------------- */

export type PlanItem = { id: string; name: string; bytes: number };
export type PlannedPart = { index: number; items: PlanItem[]; bytes: number };

/** Greedy sequential packing - deterministic for a given ordered input, so
 * every `?part=n` request recomputes the same split. A single oversized
 * item gets a part of its own. */
export function planParts(items: PlanItem[], partBytes = PART_BYTES, maxFiles = PART_MAX_FILES): PlannedPart[] {
  const parts: PlannedPart[] = [];
  let cur: PlannedPart | null = null;
  for (const item of items) {
    const size = Math.max(0, item.bytes);
    if (!cur || (cur.items.length > 0 && (cur.bytes + size > partBytes || cur.items.length >= maxFiles))) {
      cur = { index: parts.length + 1, items: [], bytes: 0 };
      parts.push(cur);
    }
    cur.items.push(item);
    cur.bytes += size;
  }
  return parts;
}

/** Short fingerprint of the ordered plan inputs. A client holding part 3 of
 * a plan can tell the gallery changed underneath it (parts would shift). */
export async function planRevision(items: PlanItem[]): Promise<string> {
  const data = new TextEncoder().encode(items.map((i) => `${i.id}:${i.bytes}:${i.name}`).join("|"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- writer ---------------- */

export type ZipPayload =
  | { bytes: Uint8Array }
  | { stream: ReadableStream<Uint8Array>; size: number };

export type ZipEntry = {
  /** Display name inside the archive (already deduped/prefixed). */
  name: string;
  /** Opened lazily so only one R2 object is in flight at a time.
   * `null` = unreadable/missing - skipped, never fails the archive. */
  open: () => Promise<ZipPayload | null>;
};

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1)) & 0xffff;
  const d = (((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()) & 0xffff;
  return { time, date: d };
}

const FLAG_UTF8 = 0x0800;
const FLAG_DESCRIPTOR = 0x0008;

function localHeader(nameBytes: Uint8Array, flags: number, crc: number, size: number, when: { time: number; date: number }): Uint8Array {
  const h = new Uint8Array(30 + nameBytes.length);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, 0x04034b50, true);
  dv.setUint16(4, 20, true);
  dv.setUint16(6, flags, true);
  dv.setUint16(8, 0, true); // STORE
  dv.setUint16(10, when.time, true);
  dv.setUint16(12, when.date, true);
  dv.setUint32(14, crc, true);
  dv.setUint32(18, size, true);
  dv.setUint32(22, size, true);
  dv.setUint16(26, nameBytes.length, true);
  dv.setUint16(28, 0, true);
  h.set(nameBytes, 30);
  return h;
}

function centralRecord(nameBytes: Uint8Array, flags: number, crc: number, size: number, offset: number, when: { time: number; date: number }): Uint8Array {
  const c = new Uint8Array(46 + nameBytes.length);
  const dv = new DataView(c.buffer);
  dv.setUint32(0, 0x02014b50, true);
  dv.setUint16(4, 20, true);
  dv.setUint16(6, 20, true);
  dv.setUint16(8, flags, true);
  dv.setUint16(10, 0, true);
  dv.setUint16(12, when.time, true);
  dv.setUint16(14, when.date, true);
  dv.setUint32(16, crc, true);
  dv.setUint32(20, size, true);
  dv.setUint32(24, size, true);
  dv.setUint16(28, nameBytes.length, true);
  dv.setUint32(42, offset, true);
  c.set(nameBytes, 46);
  return c;
}

export type ZipOptions = {
  /** Awaited before each entry opens - the revocation hook. Throwing aborts
   * the stream (the browser shows a failed download). */
  beforeEntry?: () => Promise<void>;
  when?: Date;
  /** Per-entry ceiling; defaults to the classic-ZIP limit (tests shrink it). */
  entryMaxBytes?: number;
};

/** Yield the archive as chunks. Pull-driven: R2 is only read as fast as the
 * client consumes, so a slow phone never balloons Worker memory. */
export async function* zipChunks(entries: ZipEntry[], opts: ZipOptions = {}): AsyncGenerator<Uint8Array> {
  const when = dosDateTime(opts.when ?? new Date());
  const encoder = new TextEncoder();
  const entryMax = opts.entryMaxBytes ?? ENTRY_MAX_BYTES;
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    await opts.beforeEntry?.();
    const payload = await entry.open();
    if (!payload) continue;
    const nameBytes = encoder.encode(entry.name);
    const entryOffset = offset;

    if ("bytes" in payload) {
      if (payload.bytes.length >= entryMax) continue;
      const crc = crc32(payload.bytes);
      const header = localHeader(nameBytes, FLAG_UTF8, crc, payload.bytes.length, when);
      yield header;
      yield payload.bytes;
      offset += header.length + payload.bytes.length;
      central.push(centralRecord(nameBytes, FLAG_UTF8, crc, payload.bytes.length, entryOffset, when));
    } else {
      const flags = FLAG_UTF8 | FLAG_DESCRIPTOR;
      const header = localHeader(nameBytes, flags, 0, 0, when);
      yield header;
      offset += header.length;
      const reader = payload.stream.getReader();
      let size = 0;
      let crc = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.length) continue;
          size += value.length;
          if (size >= entryMax) throw new Error("zip entry too large for a classic archive");
          crc = crc32(value, crc);
          yield value;
          offset += value.length;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const desc = new Uint8Array(16);
      const ddv = new DataView(desc.buffer);
      ddv.setUint32(0, 0x08074b50, true);
      ddv.setUint32(4, crc, true);
      ddv.setUint32(8, size, true);
      ddv.setUint32(12, size, true);
      yield desc;
      offset += desc.length;
      central.push(centralRecord(nameBytes, flags, crc, size, entryOffset, when));
    }
  }

  if (offset > ENTRY_MAX_BYTES) throw new Error("zip part exceeds the classic archive size limit");
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  for (const c of central) yield c;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  yield eocd;
}

/** The archive as a ReadableStream suitable for `new Response(stream)`. */
export function zipReadable(entries: ZipEntry[], opts: ZipOptions = {}): ReadableStream<Uint8Array> {
  const it = zipChunks(entries, opts);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await it.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}
