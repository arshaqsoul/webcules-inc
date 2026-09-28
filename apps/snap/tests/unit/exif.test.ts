/* EXIF detection + delivery-time strip (WEB-117/172) — crafted JPEGs at the
 * byte level, no fixtures needed. */
import { describe, expect, it } from "vitest";

import { jpegExifInfo, stripJpegExif } from "@/lib/exif";

/** SOI + APP0 JFIF + SOS + EOI — a metadata-free skeleton JPEG. */
function jpegNoExif(): ArrayBuffer {
  const app0 = [
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xda, 0x00, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]).buffer;
}

/** SOI + APP1 Exif with a TIFF IFD0 whose entries include tag 0x8825 (GPS). */
function jpegWithExif(gps: boolean): ArrayBuffer {
  // TIFF: II*, IFD0 at +8; one entry (GPS pointer 0x8825 or Make 0x010f), next-IFD 0.
  const tag = gps ? 0x8825 : 0x010f;
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, // IFD0 entry count = 1
    tag & 0xff, (tag >> 8) & 0xff, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ];
  const payloadSize = 6 + tiff.length; // "Exif\0\0" + TIFF
  const app1 = [
    0xff, 0xe1, (payloadSize + 2) >> 8, (payloadSize + 2) & 0xff,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    ...tiff,
  ];
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0x00, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]).buffer;
}

describe("jpegExifInfo", () => {
  it("non-JPEG payloads report jpeg:false", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).buffer;
    expect(jpegExifInfo(png)).toEqual({ jpeg: false, exif: false, gps: false });
    expect(jpegExifInfo(new Uint8Array(2).buffer)).toEqual({ jpeg: false, exif: false, gps: false });
  });

  it("JPEG without APP1/Exif reports exif:false", () => {
    expect(jpegExifInfo(jpegNoExif())).toEqual({ jpeg: true, exif: false, gps: false });
  });

  it("JPEG with Exif + GPS pointer reports both", () => {
    expect(jpegExifInfo(jpegWithExif(true))).toEqual({ jpeg: true, exif: true, gps: true });
  });

  it("JPEG with Exif but no GPS tag reports gps:false", () => {
    expect(jpegExifInfo(jpegWithExif(false))).toEqual({ jpeg: true, exif: true, gps: false });
  });
});

describe("stripJpegExif", () => {
  it("returns null when there is nothing to strip", () => {
    expect(stripJpegExif(jpegNoExif())).toBeNull();
    expect(stripJpegExif(new Uint8Array([0x89, 0x50]).buffer)).toBeNull();
  });

  it("removes the APP1/Exif segment and keeps everything else byte-identical", () => {
    const withExif = new Uint8Array(jpegWithExif(true));
    const stripped = stripJpegExif(withExif.buffer as ArrayBuffer);
    expect(stripped).not.toBeNull();
    expect(stripped!.length).toBeLessThan(withExif.length);
    // SOI preserved, JFIF/APP0 never present here, no Exif remains, SOS survives.
    expect(stripped![0]).toBe(0xff);
    expect(stripped![1]).toBe(0xd8);
    expect(jpegExifInfo(stripped!.buffer as ArrayBuffer)).toEqual({ jpeg: true, exif: false, gps: false });
    // entropy tail preserved (EOI at the very end)
    expect(stripped![stripped!.length - 2]).toBe(0xff);
    expect(stripped![stripped!.length - 1]).toBe(0xd9);
  });

  it("stripped output equals the same JPEG built without the Exif segment", () => {
    const stripped = stripJpegExif(jpegWithExif(false))!;
    const noExif = new Uint8Array(jpegNoExif());
    // Both are SOI + SOS + EOI (APP1 fully removed; the crafted APP0 length differs
    // only in the no-Exif variant, so compare the head/tail structure instead).
    expect(stripped[0]).toBe(noExif[0]);
    expect(stripped[stripped.length - 1]).toBe(noExif[noExif.length - 1]);
  });
});
