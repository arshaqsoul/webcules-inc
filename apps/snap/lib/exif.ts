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
