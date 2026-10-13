/* Upload kind classification — the single client+server-safe source of truth
 * for which file extensions Snap accepts and how they're gated. Lifted from
 * lib/repos/assets.ts (WEB-184) so client-side code (ZIP extraction) can
 * filter entries without importing server-only repos. */
export const ASKINDS = ["image", "video", "raw", "other"] as const;

const EXT_KIND: Record<string, (typeof ASKINDS)[number]> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  avif: "image",
  heic: "image",
  gif: "image",
  bmp: "image",
  /* Studio/design/document set (kind "other"): no derivatives, icon +
   * download only; "other" bypasses the free-tier RAW/video gates, same as
   * every delivery platform treats supporting documents. */
  psd: "other",
  psb: "other", // Photoshop
  ai: "other",
  ait: "other",
  eps: "other", // Illustrator / PostScript
  aep: "other",
  aepx: "other",
  prproj: "other", // After Effects / Premiere
  indd: "other", // InDesign
  pdf: "other",
  svg: "other",
  mp3: "other",
  wav: "other",
  m4a: "other",
  aif: "other",
  aiff: "other",
  flac: "other", // slideshow audio
  mp4: "video",
  mov: "video",
  webm: "video",
  /* DJI Low Resolution File — a compressed MP4 proxy recorded alongside the
   * footage on drones/Osmo/Pocket (it sniffs as ISO-BMFF video; DJI's own
   * support page says rename to .mp4 to play it). */
  lrf: "video",
  /* Camera RAW — the full brand set so every camera lands in the Vault.
   * All TIFF-container formats (II/MM byte-order headers) are caught by
   * sniffKind's TIFF branch; the non-TIFF exceptions (Sigma X3F) have
   * their own magic there. kind="raw" feeds the free-tier trial pocket (plans.ts). */
  cr2: "raw",
  cr3: "raw", // Canon
  nef: "raw",
  nrw: "raw", // Nikon
  arw: "raw",
  srf: "raw",
  sr2: "raw",
  mrw: "raw", // Sony / Minolta
  raf: "raw", // Fuji
  orf: "raw", // Olympus / OM System
  rw2: "raw",
  raw: "raw", // Panasonic (+ generic RAW containers)
  tif: "raw",
  tiff: "raw", // TIFF — uncompressed print delivery (TIFF-container magic, RAW-vault lifecycle)
  rwl: "raw", // Leica
  lfr: "raw", // Lytro Light Field RAW (Illum) — PNG-chunk magic, sniffed separately
  pef: "raw", // Pentax
  x3f: "raw", // Sigma
  "3fr": "raw",
  fff: "raw", // Hasselblad
  iiq: "raw", // Phase One
  mef: "raw", // Mamiya
  erf: "raw", // Epson
  kdc: "raw",
  dcr: "raw", // Kodak
  mos: "raw", // Leaf
  srw: "raw", // Samsung
  gpr: "raw", // GoPro
  dng: "raw", // Adobe / generic
};

const ALLOWED_EXTENSIONS: Set<string> = new Set(Object.keys(EXT_KIND));
export { ALLOWED_EXTENSIONS, EXT_KIND };

export function classifyUpload(filename: string): {
  ext: string;
  kind: (typeof ASKINDS)[number];
} | null {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;
  return { ext, kind: EXT_KIND[ext] };
}
