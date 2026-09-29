/* Slideshow model (WEB-259) — pure + client-safe. Config is per project
 * (projects.gallery_slideshow); music tracks live in the org-level
 * slideshow_track library (BYO — no catalog, studios warrant rights at
 * upload). Kept separate from the WEB-258 design JSON on purpose: the basic
 * slideshow is Free (WEB-267 gate table) while the design layer is Lite+. */

export const SLIDESHOW_MAX_JSON_BYTES = 2 * 1024;
export const MUSIC_MAX_BYTES = 15 * 1024 * 1024;

export const SLIDESHOW_PACES = [3, 5, 8] as const;
export const SLIDESHOW_TRANSITIONS = ["fade", "kenburns"] as const;

export type SlideshowConfig = {
  enabled: boolean;
  /** Seconds per slide. */
  pace: (typeof SLIDESHOW_PACES)[number];
  transition: (typeof SLIDESHOW_TRANSITIONS)[number];
  /** slideshow_track id, "" = silent. Free tier: forced "" at save + render. */
  music: string;
  /** Where the track starts (seconds) — skip a long intro. */
  musicStartAt: number;
};

const TRACK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseSlideshowConfig(input: unknown): SlideshowConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const pace = typeof raw.pace === "number" ? raw.pace : 5;
  const startAt = typeof raw.musicStartAt === "number" ? Math.round(raw.musicStartAt) : 0;
  return {
    enabled: raw.enabled === true,
    pace: (SLIDESHOW_PACES as readonly number[]).includes(pace) ? (pace as SlideshowConfig["pace"]) : 5,
    transition: (SLIDESHOW_TRANSITIONS as readonly string[]).includes(String(raw.transition)) ? (raw.transition as SlideshowConfig["transition"]) : "kenburns",
    music: typeof raw.music === "string" && TRACK_ID_RE.test(raw.music) ? raw.music : "",
    musicStartAt: Math.min(600, Math.max(0, startAt)),
  };
}

export function parseSlideshowConfigJson(stored: string | null | undefined): SlideshowConfig | null {
  if (!stored || stored.length > SLIDESHOW_MAX_JSON_BYTES) return null;
  try {
    const parsed = parseSlideshowConfig(JSON.parse(stored));
    return parsed && parsed.enabled ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeSlideshowConfig(config: SlideshowConfig): string {
  return JSON.stringify(config);
}

/** Byte sniff for the accepted audio containers — MP3 (ID3 or frame sync),
 * ADTS AAC, or M4A (ftyp brand). Extension/mime alone is never trusted. */
export function sniffAudio(bytes: Uint8Array): "mp3" | "aac" | "m4a" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "mp3"; // "ID3"
  // MPEG frame sync — layer bits non-zero (zero there = ADTS AAC).
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x18) !== 0x08 && (bytes[1] & 0x06) !== 0) return "mp3";
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "aac"; // ADTS
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp === "ftyp") {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand.startsWith("M4A") || brand.startsWith("mp42") || brand.startsWith("isom")) return "m4a";
  }
  return null;
}

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  aac: "audio/aac",
  m4a: "audio/mp4",
};

export function audioMimeOf(kind: "mp3" | "aac" | "m4a"): string {
  return AUDIO_MIME[kind];
}
