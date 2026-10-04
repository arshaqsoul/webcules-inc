/* WEB-261 downloads — pure model: settings validation, PIN helpers,
 * the approval state machine, scope labels. (ZIP format: zip-stream.test.ts.) */
import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_STATES,
  canTransition,
  isDownloadState,
  downloadScopeLabel,
  isValidPin,
  normalizeDownloadSettingsInput,
  parseDownloadSettings,
  type DownloadSettings,
} from "@/lib/gallery-downloads";

const SETTINGS: DownloadSettings = { pinHash: null, limit: null, approval: false, webSize: false };

describe("parseDownloadSettings (WEB-261)", () => {
  it("null/junk → safe defaults", () => {
    expect(parseDownloadSettings(null)).toEqual(SETTINGS);
    expect(parseDownloadSettings("nope")).toEqual(SETTINGS);
    expect(parseDownloadSettings('{"limit":"lots"}')).toEqual(SETTINGS);
  });

  it("keeps valid fields, drops junk", () => {
    const s = parseDownloadSettings('{"pinHash":"'.concat("a".repeat(64), '","limit":10,"approval":true,"webSize":true,"bogus":1}'));
    expect(s).toEqual({ pinHash: "a".repeat(64), limit: 10, approval: true, webSize: true });
    expect(parseDownloadSettings('{"pinHash":"xyz"}').pinHash).toBeNull();
    expect(parseDownloadSettings('{"limit":0}').limit).toBeNull();
    expect(parseDownloadSettings('{"limit":99999999}').limit).toBe(10_000); // read-side clamp; write-side rejects
  });
});

describe("normalizeDownloadSettingsInput (WEB-261)", () => {
  it("accepts a clean payload; rejects a bad limit", () => {
    expect(normalizeDownloadSettingsInput({ limit: 25, approval: true, webSize: true })).toEqual({ pinHash: null, limit: 25, approval: true, webSize: true });
    expect(normalizeDownloadSettingsInput({ limit: 0 })).toBeNull();
    expect(normalizeDownloadSettingsInput({ limit: "ten" })).toBeNull();
    expect(normalizeDownloadSettingsInput(null)).toBeNull();
    expect(normalizeDownloadSettingsInput([])).toBeNull();
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
