/* Streaming store-ZIP builder over R2 multipart (WEB-261) — memory-bounded
 * by construction and honest about R2's rules:
 *  - multipart parts (except the last) must be ≥ 5 MiB → a staging buffer
 *    flushes at ~6 MiB, so peak memory stays < ~10 MiB regardless of gallery
 *    size;
 *  - CRCs are computed during the copy and emitted as ZIP *data
 *    descriptors* after each entry (flag bit 3 — universally supported),
 *    so no second read pass is needed;
 *  - STORE method (no deflate): photos are already compressed, and pure
 *    byte-copy keeps cron CPU tiny.
 * Entries may be prefixed (folder-scoped ZIPs keep their WEB-216 labels). */
import { env } from "cloudflare:workers";

const PART_FLUSH_BYTES = 6 * 1024 * 1024;
const READ_CHUNK = 4 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, seed = 0): number {
  let c = ~seed;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const d = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, date: d };
}

export type ZipEntrySource = {
  /** Display name inside the archive (already deduped/prefixed by caller). */
  name: string;
  /** ReadableStream of the STORE payload (R2 object body). */
  stream: ReadableStream<Uint8Array>;
};

/** Minimal ZIP (method 0) writer that streams into an R2 multipart upload. */
export class R2ZipWriter {
  private upload: R2MultipartUpload;
  private parts: { partNumber: number; etag: string }[] = [];
  private pending: Uint8Array[] = [];
  private pendingLen = 0;
  private offset = 0;
  private central: Uint8Array[] = [];
  private centralCount = 0;

  private constructor(private readonly key: string, upload: R2MultipartUpload) {
    this.upload = upload;
  }

  static async create(key: string): Promise<R2ZipWriter> {
    const upload = await env.R2.createMultipartUpload(key, {
      httpMetadata: { contentType: "application/zip" },
    });
    return new R2ZipWriter(key, upload);
  }

  get storedKey(): string {
    return this.key;
  }

  private async flush(force = false): Promise<void> {
    if (this.pendingLen === 0) return;
    if (!force && this.pendingLen < PART_FLUSH_BYTES) return;
    let merged: Uint8Array;
    if (this.pending.length === 1) {
      merged = this.pending[0];
    } else {
      merged = new Uint8Array(this.pendingLen);
      let at = 0;
      for (const chunk of this.pending) {
        merged.set(chunk, at);
        at += chunk.length;
      }
    }
    const partNumber = this.parts.length + 1;
    const part = await this.upload.uploadPart(partNumber, merged);
    this.parts.push({ partNumber, etag: part.etag });
    this.offset += this.pendingLen;
    this.pending = [];
    this.pendingLen = 0;
  }

  private stage(bytes: Uint8Array): void {
    this.pending.push(bytes);
    this.pendingLen += bytes.length;
  }

  private async stageStreamed(stream: ReadableStream<Uint8Array>): Promise<{ size: number; crc: number }> {
    const reader = stream.getReader();
    let size = 0;
    let crc = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      crc = crc32(value, crc);
      size += value.length;
      this.stage(value);
      await this.flush();
    }
    return { size, crc: crc >>> 0 };
  }

  /** One STORE entry: local header (data-descriptor flag) → payload →
   * descriptor; the central-directory record is buffered for finish(). */
  async addFile(entry: ZipEntrySource, when = new Date()): Promise<void> {
    const { time, date } = dosDateTime(when);
    const nameBytes = new TextEncoder().encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true); // local file header
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0x0800, true); // UTF-8 names
    dv.setUint16(8, 0x0008, true); // data descriptor follows
    dv.setUint16(10, 0, true); // STORE
    dv.setUint16(12, time, true);
    dv.setUint16(14, date, true);
    dv.setUint32(16, 0, true); // crc — in the descriptor
    dv.setUint32(20, 0, true); // sizes — in the descriptor
    dv.setUint32(24, 0, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    header.set(nameBytes, 30);
    this.stage(header);

    const entryOffset = this.offset;
    const { size, crc } = await this.stageStreamed(entry.stream);

    const desc = new Uint8Array(16);
    const ddv = new DataView(desc.buffer);
    ddv.setUint32(0, 0x08074b50, true);
    ddv.setUint32(4, crc, true);
    ddv.setUint32(8, size, true);
    ddv.setUint32(12, size, true);
    this.stage(desc);
    await this.flush();

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(38, 0x0808, true); // data descriptor was present
    cv.setUint32(42, entryOffset, true);
    central.set(nameBytes, 46);
    this.central.push(central);
    this.centralCount += 1;
  }

  /** Close the archive; returns final metadata. */
  async finish(): Promise<{ key: string; bytes: number; files: number }> {
    const centralSize = this.central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.centralCount, true);
    ev.setUint16(10, this.centralCount, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, this.offset, true);
    for (const c of this.central) this.stage(c);
    this.stage(eocd);
    await this.flush(true);

    await this.upload.complete(this.parts);
    return { key: this.key, bytes: this.offset, files: this.centralCount };
  }

  async abort(): Promise<void> {
    try {
      await this.upload.abort();
    } catch {
      // best effort
    }
  }
}

/** Dedupe names inside the archive ("IMG_1.jpg" from two folders →
 * "Ceremony/IMG_1.jpg", duplicates get " (n)"). */
export function allocateZipName(taken: Set<string>, folder: string | null, filename: string): string {
  const base = `${folder ? `${folder.replace(/[\\/]/g, "-")}/` : ""}${filename.replace(/[\\/]/g, "-")}`;
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}
