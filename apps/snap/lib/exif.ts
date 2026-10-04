/* EXIF/GPS presence detection (WEB-117) — a byte-level JPEG segment walk, no
 * decode, no deps. Derivatives from the browser's canvas are metadata-free by
 * construction; this is the server-side proof (and guard) for studios that
 * enable the strip policy: a derivative that still carries an APP1/Exif
 * segment — especially a GPSInfo IFD — is rejected instead of stored. */
export type JpegExifInfo = { jpeg: boolean; exif: boolean; gps: boolean };

export function jpegExifInfo(bytes: ArrayBuffer): JpegExifInfo {
  const v = new DataView(bytes);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return { jpeg: false, exif: false, gps: false };
  let off = 2;
  // Metadata segments live between SOI and SOS; stop at the entropy data.
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffd8) break; // lost sync
    if (marker === 0xffda || marker === 0xffd9) break; // SOS / EOI
    const size = v.getUint16(off + 2);
    if (size < 2) break; // malformed
    if (marker === 0xffe1 && size >= 10 && v.getUint32(off + 4) === 0x45786966 && v.getUint8(off + 8) === 0) {
      // APP1 "Exif\0\0" — TIFF structure starts 6 bytes into the payload.
      return { jpeg: true, exif: true, gps: gpsInTiff(v, off + 10) };
    }
    off += 2 + size;
  }
  return { jpeg: true, exif: false, gps: false };
}

/** GPSInfo IFD pointer (tag 0x8825) present in IFD0 of the Exif TIFF? */
function gpsInTiff(v: DataView, tiff: number): boolean {
  try {
    const bom = v.getUint16(tiff);
    if (bom !== 0x4949 && bom !== 0x4d4d) return false; // II / MM
    const le = bom === 0x4949;
    const ifd0 = tiff + v.getUint32(tiff + 4, le);
    if (ifd0 + 2 > v.byteLength) return false;
    const count = v.getUint16(ifd0, le);
    for (let i = 0; i < count; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 2 > v.byteLength) return false;
      if (v.getUint16(e, le) === 0x8825) return true;
    }
  } catch {
    // short read — treat as no GPS rather than guessing
  }
  return false;
}

/* EXIF removal at delivery (WEB-172) — rebuilds the JPEG without its
 * APP1/Exif segments (GPS lives inside the Exif TIFF, so it goes with
 * them). Everything else — JFIF, XMP, ICC profile, the image data — is
 * copied byte-for-byte. Returns null when there is nothing to strip. */
export function stripJpegExif(bytes: ArrayBuffer): Uint8Array | null {
  const v = new DataView(bytes);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  // find every APP1 "Exif\0\0" segment between SOI and SOS
  let off = 2;
  const cuts: [number, number][] = [];
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffd8) break;
    if (marker === 0xffda || marker === 0xffd9) break;
    const size = v.getUint16(off + 2);
    if (size < 2) break;
    if (marker === 0xffe1 && size >= 10 && v.getUint32(off + 4) === 0x45786966 && v.getUint8(off + 8) === 0) {
      cuts.push([off, 2 + size]);
    }
    off += 2 + size;
  }
  if (cuts.length === 0) return null;
  const src = new Uint8Array(bytes);
  const out = new Uint8Array(bytes.byteLength - cuts.reduce((n, c) => n + c[1], 0));
  let w = 0;
  let r = 0;
  for (const [start, len] of cuts) {
    out.set(src.subarray(r, start), w);
    w += start - r;
    r = start + len;
  }
  out.set(src.subarray(r), w);
  return out;
}


/** EXIF capture time (DateTimeOriginal → DateTimeDigitized → DateTime) as
 * epoch seconds, or null. Reads a JPEG's APP1/Exif or any TIFF-container
 * file (DNG, NEF, CR2, ARW...) from just the first bytes. EXIF stores local
 * wall-clock time with no zone, so it is read as UTC: that keeps photos from
 * one camera in the right order, which is all sorting needs. */
export function exifCaptureDate(bytes: ArrayBuffer): number | null {
  try {
    const v = new DataView(bytes);
    let tiff = -1;
    if (v.byteLength >= 12 && v.getUint16(0) === 0xffd8) {
      let off = 2;
      while (off + 4 <= v.byteLength) {
        const marker = v.getUint16(off);
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffd8) break;
        if (marker === 0xffda || marker === 0xffd9) break;
        const size = v.getUint16(off + 2);
        if (size < 2) break;
        if (marker === 0xffe1 && size >= 10 && v.getUint32(off + 4) === 0x45786966 && v.getUint8(off + 8) === 0) {
          tiff = off + 10;
          break;
        }
        off += 2 + size;
      }
    } else if (v.byteLength >= 8) {
      const bom = v.getUint16(0);
      if ((bom === 0x4949 || bom === 0x4d4d) && (bom === 0x4949 ? v.getUint16(2, true) : v.getUint16(2)) === 42) tiff = 0;
    }
    if (tiff < 0) return null;
    const bom = v.getUint16(tiff);
    const le = bom === 0x4949;
    if (!le && bom !== 0x4d4d) return null;

    const readAscii = (entry: number): string | null => {
      const count = v.getUint32(entry + 4, le);
      if (count < 19 || count > 64) return null;
      const at = tiff + v.getUint32(entry + 8, le);
      if (at + count > v.byteLength) return null;
      let s = "";
      for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(at + i));
      return s;
    };
    const scanIfd = (ifd: number, wanted: number[]): { found: Map<number, number>; exifIfd: number | null } => {
      const found = new Map<number, number>();
      let exifIfd: number | null = null;
      if (ifd + 2 > v.byteLength) return { found, exifIfd };
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n && i < 200; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > v.byteLength) break;
        const tag = v.getUint16(e, le);
        if (tag === 0x8769) exifIfd = tiff + v.getUint32(e + 8, le);
        else if (wanted.includes(tag)) found.set(tag, e);
      }
      return { found, exifIfd };
    };

    const ifd0 = scanIfd(tiff + v.getUint32(tiff + 4, le), [0x0132]);
    const exif = ifd0.exifIfd !== null ? scanIfd(ifd0.exifIfd, [0x9003, 0x9004]) : { found: new Map<number, number>() };
    for (const entry of [exif.found.get(0x9003), exif.found.get(0x9004), ifd0.found.get(0x0132)]) {
      if (entry === undefined) continue;
      const text = readAscii(entry);
      const m = text?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (!m) continue;
      const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      if (m[1] !== "0000" && Number.isFinite(ms)) return Math.floor(ms / 1000);
    }
  } catch {
    // truncated / malformed EXIF - no date, never an error
  }
  return null;
}
