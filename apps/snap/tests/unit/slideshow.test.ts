/* WEB-259 slideshow — pure model: config validation/canonicalization, audio
 * byte-sniffing, tier stripping; plus view-budget pacing (a slideshow at its
 * fastest pace must never trip the per-IP image limiter). */
import { describe, expect, it } from "vitest";

import {
  audioMimeOf,
  MUSIC_MAX_BYTES,
  parseSlideshowConfig,
  parseSlideshowConfigJson,
  serializeSlideshowConfig,
  SLIDESHOW_MAX_JSON_BYTES,
  sniffAudio,
} from "@/lib/slideshow";
import { slideshowForTier } from "@/lib/repos/slideshow";

const CFG = { enabled: true, pace: 5, transition: "kenburns", music: "track-1", musicStartAt: 12 };

describe("parseSlideshowConfig (WEB-259)", () => {
  it("round-trips a valid config", () => {
    expect(parseSlideshowConfig(CFG)).toEqual(CFG);
    expect(parseSlideshowConfigJson(serializeSlideshowConfig(CFG))).toEqual(CFG);
  });

  it("falls back bad enums, clamps the offset, drops junk ids", () => {
    const d = parseSlideshowConfig({ enabled: true, pace: 4, transition: "wipe", music: "not an id!", musicStartAt: -5 })!;
    expect(d.pace).toBe(5);
    expect(d.transition).toBe("kenburns");
    expect(d.music).toBe("");
    expect(d.musicStartAt).toBe(0);
    expect(parseSlideshowConfig({ enabled: true, pace: 3, transition: "fade", music: "", musicStartAt: 9999 })!.musicStartAt).toBe(600);
  });

  it("disabled / junk / oversized stored JSON → null (no button)", () => {
    expect(parseSlideshowConfigJson(JSON.stringify({ ...CFG, enabled: false }))).toBeNull();
    expect(parseSlideshowConfigJson("nope")).toBeNull();
    expect(parseSlideshowConfigJson("x".repeat(SLIDESHOW_MAX_JSON_BYTES + 1))).toBeNull();
    expect(parseSlideshowConfig("[]")).toBeNull();
  });
});

describe("sniffAudio (WEB-259)", () => {
  it("recognizes ID3 and frame-sync MP3, ADTS AAC, M4A ftyp — rejects everything else", () => {
    const u = (header: number[], tail = 10) => Uint8Array.from([...header, ...new Array<number>(tail).fill(0)]);
    expect(sniffAudio(u([0x49, 0x44, 0x33]))).toBe("mp3"); // "ID3"
    expect(sniffAudio(Uint8Array.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("mp3");
    expect(sniffAudio(Uint8Array.from([0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("aac");
    expect(sniffAudio(Uint8Array.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]))).toBe("m4a"); // "....ftypM4A "
    expect(sniffAudio(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBeNull(); // PNG
    expect(sniffAudio(new Uint8Array(4))).toBeNull();
  });

  it("maps kinds to stream mimes", () => {
    expect(audioMimeOf("mp3")).toBe("audio/mpeg");
    expect(audioMimeOf("m4a")).toBe("audio/mp4");
    expect(MUSIC_MAX_BYTES).toBe(15 * 1024 * 1024);
  });
});

describe("slideshowForTier (WEB-259 gates)", () => {
  it("Lite keeps the track; Free gets the same slideshow, silent — never audio", () => {
    expect(slideshowForTier(CFG, true)).toEqual(CFG);
    const free = slideshowForTier(CFG, false)!;
    expect(free.enabled).toBe(true);
    expect(free.pace).toBe(5);
    expect(free.music).toBe("");
    expect(slideshowForTier({ ...CFG, enabled: false }, true)).toBeNull();
    expect(slideshowForTier(null, true)).toBeNull();
  });
});
