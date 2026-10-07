/* WEB-242 watermark engine unit tests: config sanitizing/clamping and the
 * effective-config truth table (entitlement gate, project override,
 * on-without-config fallback). */
import { describe, expect, it } from "vitest";

import { effectiveWatermark, parseWatermarkConfig, sanitizeWatermarkInput, watermarkOverrideAllowed } from "@/lib/watermark";

const ENT_ON = { whiteLabel: true };
const ENT_OFF = { whiteLabel: false };

describe("sanitizeWatermarkInput (WEB-242)", () => {
  it("accepts and clamps a valid config", () => {
    const cfg = sanitizeWatermarkInput({ mode: "corner", opacity: 0.9, scale: 3, margin: -2 });
    expect(cfg).toEqual({ mode: "corner", opacity: 0.6, scale: 0.5, margin: 0.01 });
  });

  it("applies defaults for missing numbers", () => {
    expect(sanitizeWatermarkInput({ mode: "tiled" })).toEqual({
      mode: "tiled",
      opacity: 0.25,
      scale: 0.2,
      margin: 0.04,
    });
  });

  it("mode off / unknown / junk → null (the off value)", () => {
    expect(sanitizeWatermarkInput({ mode: "off" })).toBeNull();
    expect(sanitizeWatermarkInput({ mode: "diagonal" })).toBeNull();
    expect(sanitizeWatermarkInput(null)).toBeNull();
    expect(sanitizeWatermarkInput("corner")).toBeNull();
  });

  it("text mode caps the text at 60 chars; other modes drop it", () => {
    const cfg = sanitizeWatermarkInput({ mode: "text", text: "x".repeat(200) });
    expect(cfg?.text).toHaveLength(60);
    expect(sanitizeWatermarkInput({ mode: "corner", text: "dropped" })?.text).toBeUndefined();
  });
});

describe("parseWatermarkConfig (WEB-242)", () => {
  it("reads from a brand bag object or JSON string", () => {
    expect(parseWatermarkConfig({ watermark: { mode: "corner" } })?.mode).toBe("corner");
    expect(parseWatermarkConfig(JSON.stringify({ watermark: { mode: "tiled" } }))?.mode).toBe("tiled");
  });

  it("absent watermark / junk bag / junk inner → null", () => {
    expect(parseWatermarkConfig({})).toBeNull();
    expect(parseWatermarkConfig("not json")).toBeNull();
    expect(parseWatermarkConfig({ watermark: "junk" })).toBeNull();
    expect(parseWatermarkConfig({ watermark: { mode: "off" } })).toBeNull();
  });
});

describe("effectiveWatermark (WEB-242)", () => {
  const branded = { watermark: { mode: "corner" } };

  it("entitlement gates everything", () => {
    expect(effectiveWatermark({ ent: ENT_OFF, brand: branded, override: "on" })).toBeNull();
    expect(effectiveWatermark({ ent: null, brand: branded })).toBeNull();
  });

  it("inherit: studio config decides", () => {
    expect(effectiveWatermark({ ent: ENT_ON, brand: branded })?.mode).toBe("corner");
    expect(effectiveWatermark({ ent: ENT_ON, brand: {} })).toBeNull();
  });

  it("override off wins over an on config", () => {
    expect(effectiveWatermark({ ent: ENT_ON, brand: branded, override: "off" })).toBeNull();
  });

  it("override on with no studio config falls back to studio-name text", () => {
    const cfg = effectiveWatermark({ ent: ENT_ON, brand: {}, override: "on", studioName: "Willow & Pine" });
    expect(cfg?.mode).toBe("text");
    expect(cfg?.text).toBe("Willow & Pine");
  });

  it("override on with a config uses the config", () => {
    expect(effectiveWatermark({ ent: ENT_ON, brand: branded, override: "on" })?.mode).toBe("corner");
  });
});

describe("watermarkOverrideAllowed (Lite/Free must not save a setting that does nothing)", () => {
  it("Studio+ may set every override", () => {
    for (const o of ["inherit", "on", "off"] as const) expect(watermarkOverrideAllowed(ENT_ON, o)).toBe(true);
  });

  it("plans without white-label may only clear back to inherit", () => {
    expect(watermarkOverrideAllowed(ENT_OFF, "inherit")).toBe(true);
    expect(watermarkOverrideAllowed(ENT_OFF, "on")).toBe(false);
    expect(watermarkOverrideAllowed(ENT_OFF, "off")).toBe(false);
  });

  it("missing entitlements behave like no white-label", () => {
    expect(watermarkOverrideAllowed(null, "on")).toBe(false);
    expect(watermarkOverrideAllowed(null, "inherit")).toBe(true);
  });
});
