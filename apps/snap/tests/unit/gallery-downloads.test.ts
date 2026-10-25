/* WEB-261 downloads — pure model: settings validation, PIN helpers,
 * the approval state machine, scope labels. (ZIP format: zip-stream.test.ts.) */
import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_STATES,
  LICENSE_TEXT_MAX,
  SIZE_LONG_EDGE,
  canTransition,
  isDownloadState,
  downloadScopeLabel,
  isValidPin,
  licenseTextOf,
  normalizeCaptureEmail,
  normalizeDownloadSettingsInput,
  parseDownloadSettings,
  parseSizePref,
  sanitizeLicenseText,
  sizeOffered,
  type DownloadSettings,
} from "@/lib/gallery-downloads";

const SETTINGS: DownloadSettings = { pinHash: null, limit: null, approval: false, webSize: false, emailCapture: false, selectionOnly: false };

describe("parseDownloadSettings (WEB-261)", () => {
  it("null/junk → safe defaults", () => {
    expect(parseDownloadSettings(null)).toEqual(SETTINGS);
    expect(parseDownloadSettings("nope")).toEqual(SETTINGS);
    expect(parseDownloadSettings('{"limit":"lots"}')).toEqual(SETTINGS);
  });

  it("keeps valid fields, drops junk", () => {
    const s = parseDownloadSettings('{"pinHash":"'.concat("a".repeat(64), '","limit":10,"approval":true,"webSize":true,"bogus":1}'));
    expect(s).toEqual({ pinHash: "a".repeat(64), limit: 10, approval: true, webSize: true, emailCapture: false, selectionOnly: false });
    expect(parseDownloadSettings('{"pinHash":"xyz"}').pinHash).toBeNull();
    expect(parseDownloadSettings('{"limit":0}').limit).toBeNull();
    expect(parseDownloadSettings('{"limit":99999999}').limit).toBe(10_000); // read-side clamp; write-side rejects
  });

  it("WEB-194: emailCapture parses true; junk stays false", () => {
    expect(parseDownloadSettings('{"emailCapture":true}').emailCapture).toBe(true);
    expect(parseDownloadSettings('{"emailCapture":"yes"}').emailCapture).toBe(false);
    expect(parseDownloadSettings(null).emailCapture).toBe(false);
  });

  it("WEB-102: selectionOnly parses true; junk stays false", () => {
    expect(parseDownloadSettings('{"selectionOnly":true}').selectionOnly).toBe(true);
    expect(parseDownloadSettings('{"selectionOnly":1}').selectionOnly).toBe(false);
    expect(parseDownloadSettings(null).selectionOnly).toBe(false);
  });
});

describe("normalizeDownloadSettingsInput (WEB-261)", () => {
  it("accepts a clean payload; rejects a bad limit", () => {
    expect(normalizeDownloadSettingsInput({ limit: 25, approval: true, webSize: true, emailCapture: false })).toEqual({ pinHash: null, limit: 25, approval: true, webSize: true, emailCapture: false, selectionOnly: false });
    expect(normalizeDownloadSettingsInput({ limit: 0 })).toBeNull();
    expect(normalizeDownloadSettingsInput({ limit: "ten" })).toBeNull();
    expect(normalizeDownloadSettingsInput(null)).toBeNull();
    expect(normalizeDownloadSettingsInput([])).toBeNull();
  });

  it("WEB-194: emailCapture round-trips through the API input path", () => {
    expect(normalizeDownloadSettingsInput({ emailCapture: true })?.emailCapture).toBe(true);
    expect(normalizeDownloadSettingsInput({ emailCapture: 1 })?.emailCapture).toBe(false); // truthy-boolean only
  });

  it("WEB-102: selectionOnly round-trips through the API input path", () => {
    expect(normalizeDownloadSettingsInput({ selectionOnly: true })?.selectionOnly).toBe(true);
    expect(normalizeDownloadSettingsInput({ selectionOnly: "yes" })?.selectionOnly).toBe(false);
    expect(normalizeDownloadSettingsInput({})?.selectionOnly).toBe(false);
  });

  it("WEB-102: the settings JSON stays inside the 512-byte cap with selectionOnly set", () => {
    const worst = JSON.stringify({ ...SETTINGS, pinHash: "a".repeat(64), limit: 10_000, approval: true, webSize: true, emailCapture: true, selectionOnly: true });
    expect(worst.length).toBeLessThanOrEqual(512);
  });
});

describe("capture email (WEB-194)", () => {
  it("normalizeCaptureEmail trims, lowercases, and rejects junk", () => {
    expect(normalizeCaptureEmail("  Guest@Event.Test ")).toBe("guest@event.test");
    expect(normalizeCaptureEmail("a@b.co")).toBe("a@b.co");
    expect(normalizeCaptureEmail("nope")).toBeNull();
    expect(normalizeCaptureEmail("a b@c.test")).toBeNull();
    expect(normalizeCaptureEmail("a@nodot")).toBeNull();
    expect(normalizeCaptureEmail("@c.test")).toBeNull();
    expect(normalizeCaptureEmail("a@b.c")).toBeNull(); // TLD too short
  });
});

describe("PIN (WEB-261)", () => {
  it("validates 4–8 digits", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("123456789")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });

  it("hashes per grant — same PIN, different grants differ", async () => {
    const a = await (await import("@/lib/gallery-downloads")).hashDownloadPin("4321", "g1");
    const b = await (await import("@/lib/gallery-downloads")).hashDownloadPin("4321", "g2");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("approval state machine (downloads 3.0)", () => {
  it("requested → approved/rejected; approved → delivered; nothing else", () => {
    expect(canTransition("requested", "approved")).toBe(true);
    expect(canTransition("requested", "rejected")).toBe(true);
    expect(canTransition("requested", "delivered")).toBe(false);
    expect(canTransition("approved", "delivered")).toBe(true);
    expect(canTransition("approved", "rejected")).toBe(false);
    expect(canTransition("delivered", "approved")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("the retired build states are not states any more", () => {
    for (const gone of ["zipping", "ready", "expired", "failed"]) expect(isDownloadState(gone)).toBe(false);
    expect(DOWNLOAD_STATES).toEqual(["requested", "approved", "rejected", "delivered"]);
  });
});

describe("labels (WEB-261)", () => {
  it("scope labels", () => {
    expect(downloadScopeLabel("all", null)).toBe("the whole gallery");
    expect(downloadScopeLabel("favorites", null)).toBe("your favorites");
    expect(downloadScopeLabel("folder", "Ceremony")).toBe("“Ceremony”");
  });
});

describe("size ladder (WEB-196)", () => {
  it("the ladder is Original / 2048 / 1280", () => {
    expect(SIZE_LONG_EDGE).toEqual({ web: 2048, mid: 1280 });
  });

  it("source-aware hiding: a rung shows only when the source is at least that big", () => {
    // big source: everything offered
    expect(sizeOffered("web", 4000)).toBe(true);
    expect(sizeOffered("mid", 4000)).toBe(true);
    // a 2048-wide source: web yes (exact), mid yes
    expect(sizeOffered("web", 2048)).toBe(true);
    expect(sizeOffered("mid", 2048)).toBe(true);
    // a 1500px source: web hidden (would upscale), mid offered
    expect(sizeOffered("web", 1500)).toBe(false);
    expect(sizeOffered("mid", 1500)).toBe(true);
    // a small source: only the original ships
    expect(sizeOffered("web", 1024)).toBe(false);
    expect(sizeOffered("mid", 1024)).toBe(false);
    expect(sizeOffered("mid", 1280)).toBe(true); // exact fit still offered
  });

  it("unknown intrinsic size → best effort (offered, delivery degrades)", () => {
    expect(sizeOffered("web", null)).toBe(true);
    expect(sizeOffered("mid", undefined)).toBe(true);
  });

  it("parseSizePref: web+mid ride the webSize toggle; everything else is full", () => {
    expect(parseSizePref("web", true)).toBe("web");
    expect(parseSizePref("mid", true)).toBe("mid");
    expect(parseSizePref("mid", false)).toBe("full"); // gallery doesn't offer sizes
    expect(parseSizePref("web", false)).toBe("full");
    expect(parseSizePref("huge", true)).toBe("full");
    expect(parseSizePref(null, true)).toBe("full");
  });
});

describe("license text (WEB-193)", () => {
  it("sanitizeLicenseText strips HTML, control chars, and caps at 2 KB", () => {
    expect(sanitizeLicenseText("  Personal use only.  ")).toBe("Personal use only.");
    expect(sanitizeLicenseText("<script>alert(1)</script>Personal use")).toBe("alert(1)Personal use");
    expect(sanitizeLicenseText("a\u0000b\u0007c")).toBe("abc");
    expect(sanitizeLicenseText("line\r\nbreak")).toBe("line\nbreak");
    expect(sanitizeLicenseText("x".repeat(LICENSE_TEXT_MAX + 50))).toHaveLength(LICENSE_TEXT_MAX);
  });

  it("empty/whitespace-only text sanitizes to empty (gate off)", () => {
    expect(sanitizeLicenseText("   ")).toBe("");
    expect(sanitizeLicenseText("<p></p>")).toBe("");
  });

  it("licenseTextOf re-sanitizes stored rows and treats null as off", () => {
    expect(licenseTextOf(null)).toBe("");
    expect(licenseTextOf({ licenseText: null })).toBe("");
    expect(licenseTextOf({ licenseText: "  ok  " })).toBe("ok");
    // a hand-edited legacy row can't smuggle markup past the read path
    expect(licenseTextOf({ licenseText: "<b>bold</b> text" })).toBe("bold text");
  });
});
