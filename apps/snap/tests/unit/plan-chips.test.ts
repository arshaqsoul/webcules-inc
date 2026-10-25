/* WEBC-117 — the Billing feature chips must equal the shipped server gates.
 * The chips used to hard-code plan checks inside components/plan-panel.tsx
 * and drifted (the "Custom form fields" chip struck through a feature the
 * API actually allows, capped, on Free/Lite). Now every chip state comes
 * from lib/plans-data.ts via lib/feature-chips.ts; this suite pins three
 * layers so drift anywhere fails:
 *   1. the audited gate matrix (server routes are the truth),
 *   2. PlanDef capability flags vs that matrix,
 *   3. plan-panel.tsx rendering the chips through the shared helpers,
 *      with no inline plan-id checks left behind. */
import { describe, expect, it } from "vitest";

import bookingPageRoute from "../../app/api/studio/booking-page/route.ts?raw";
import assetViewsRoute from "../../app/api/projects/[id]/asset-views/route.ts?raw";
import sneakPeekRoute from "../../app/api/assets/sneak-peek/route.ts?raw";
import slideshowMusicRoute from "../../app/api/studio/slideshow-music/route.ts?raw";
import templatesRoute from "../../app/api/studio/templates/route.ts?raw";
import downloadSettingsRoute from "../../app/api/grants/[id]/download-settings/route.ts?raw";
import planPanelSource from "../../components/plan-panel.tsx?raw";
import lockedFeatureSource from "../../components/locked-feature.tsx?raw";

import { capabilityUnlocked, customFieldsChip, PLAN_LADDER, type CapabilityKey } from "@/lib/feature-chips";
import { PLANS } from "@/lib/plans";
import { FREE_CUSTOM_FIELD_CAP } from "@/lib/forms";

type Mark = "✔" | "✖";
const PLANS_ORDER = ["free", "lite", "studio", "pro"] as const;

/** The audited ladder (staging audit 24 Oct 2026, repo HEAD 13914ea): each
 * capability flips on at the tier the server routes gate it. */
const MATRIX: Record<CapabilityKey, [Mark, Mark, Mark, Mark]> = {
  bookingPageDesigner: ["✖", "✔", "✔", "✔"], // lite_required (booking-page route)
  customGalleryDesigns: ["✖", "✔", "✔", "✔"], // presets_require_lite / design_requires_lite
  slideshowMusic: ["✖", "✔", "✔", "✔"], // music_requires_lite
  downloadPin: ["✖", "✔", "✔", "✔"], // pin_requires_lite + web_size_requires_lite
  sneakPeeks: ["✖", "✖", "✔", "✔"], // sneak_peeks_require_studio + approvals_require_studio
  perPhotoInsights: ["✖", "✖", "✔", "✔"], // insights_require_studio
};

describe("billing feature chips equal the shipped gates (WEBC-117)", () => {
  it("the server gates this matrix pins are still in the routes", () => {
    const gates = [
      ["lite_required", bookingPageRoute],
      ["music_requires_lite", slideshowMusicRoute],
      ["pin_requires_lite", downloadSettingsRoute],
      ["web_size_requires_lite", downloadSettingsRoute],
      ["approvals_require_studio", downloadSettingsRoute],
      ["sneak_peeks_require_studio", sneakPeekRoute],
      ["insights_require_studio", assetViewsRoute],
      ["custom_fields_limit", templatesRoute],
    ] as const;
    for (const [marker, src] of gates) {
      expect(src, `gate ${marker} must stay`).toContain(marker);
    }
  });

  it("every PlanDef capability flag matches the audited matrix, for every plan", () => {
    for (const [key, marks] of Object.entries(MATRIX) as [CapabilityKey, [Mark, Mark, Mark, Mark]][]) {
      PLANS_ORDER.forEach((plan, i) => {
        const unlocked = capabilityUnlocked(key, plan);
        expect(
          `${key}/${plan}: ${unlocked ? "✔" : "✖"}`,
          `${key} drifted from the shipped gate on ${plan}`,
        ).toBe(`${key}/${plan}: ${marks[i]}`);
      });
    }
  });

  it("the ladder is monotonic: a capability never disappears as tiers rise", () => {
    for (const key of Object.keys(MATRIX) as CapabilityKey[]) {
      let seen = false;
      for (const plan of PLAN_LADDER) {
        if (capabilityUnlocked(key, plan)) seen = true;
        else expect(seen, `${key} re-locks at ${plan}`).toBe(false);
      }
    }
  });

  it("custom form fields: capped on Free/Lite (the API's real cap), unlimited Studio+", () => {
    expect(customFieldsChip("free")).toEqual({ state: "capped", label: `Custom form fields · up to ${FREE_CUSTOM_FIELD_CAP}` });
    expect(customFieldsChip("lite")).toEqual({ state: "capped", label: `Custom form fields · up to ${FREE_CUSTOM_FIELD_CAP}` });
    expect(customFieldsChip("studio")).toEqual({ state: "included", label: "Unlimited custom form fields" });
    expect(customFieldsChip("pro")).toEqual({ state: "included", label: "Unlimited custom form fields" });
    // The cap lives in ONE place — the gate's own constant.
    expect(PLANS.free.maxCustomFields).toBe(FREE_CUSTOM_FIELD_CAP);
    expect(PLANS.lite.maxCustomFields).toBe(FREE_CUSTOM_FIELD_CAP);
    expect(PLANS.studio.maxCustomFields).toBeNull();
    expect(PLANS.pro.maxCustomFields).toBeNull();
  });

  it("plan-panel renders the chips from the shared helpers — no inline plan checks left", () => {
    for (const label of [
      "Booking page designer",
      "Designed galleries + client app",
      "Slideshows w/ music + sharing",
      "Download PIN + web size",
      "Sneak peeks + approvals",
      "Per-photo insights",
    ]) {
      const re = new RegExp(`<LockedFeature[^>]*label="${label.replace(/[+]/g, "\\+")}"`);
      expect(planPanelSource, `${label} must render via <LockedFeature>`).toMatch(re);
    }
    expect(planPanelSource).toContain("customFieldsChip(st.plan)");
    // The old drift pattern: a chip styling itself from a plan-id ternary.
    expect(planPanelSource).not.toMatch(/st\.plan [!=]==? "(?:free|studio|pro)" [?&][^/]*line-through/);
  });

  it("the LockedFeature component derives state from plans-data, not plan ids", () => {
    expect(lockedFeatureSource).toContain("capabilityChip");
    expect(lockedFeatureSource).not.toMatch(/plan [!=]==? "/);
  });
});
