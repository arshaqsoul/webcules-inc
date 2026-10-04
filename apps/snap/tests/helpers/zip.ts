/* Test helper: read a ZIP back the way an unzip tool does (EOCD → central
 * directory → local headers → payload) so tests assert what a user's
 * archive tool will see, not what the writer intended. */
import { expect } from "vitest";

export type ParsedZipEntry = { name: string; crc: number; size: number; flags: number; data: Uint8Array };

/** Walk the EOCD + central directory like an unzip tool and extract entries. */
export function parseZip(zip: Uint8Array): ParsedZipEntry[] {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  expect(cdOffset + cdSize).toBe(eocd);

  const out: ParsedZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    const flags = dv.getUint16(p + 8, true);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    expect(dv.getUint16(local + 8, true)).toBe(0); // STORE
    const dataStart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = zip.subarray(dataStart, dataStart + size);
    if (flags & 0x0008) {
      // streamed entry: data descriptor right after the payload carries crc + sizes
      expect(dv.getUint32(dataStart + size, true)).toBe(0x08074b50);
      expect(dv.getUint32(dataStart + size + 4, true)).toBe(crc);
      expect(dv.getUint32(dataStart + size + 8, true)).toBe(size);
    } else {
      expect(dv.getUint32(local + 14, true)).toBe(crc); // header already holds the truth
      expect(dv.getUint32(local + 22, true)).toBe(size);
    }
    out.push({ name, crc, size, flags, data });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return out;
}
