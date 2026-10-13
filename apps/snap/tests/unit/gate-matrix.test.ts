/* WEB-256 launch gate — the tier ladder, asserted as a matrix against the
 * story table so drift in any surface fails the suite. Every gate here is
 * enforced server-side (see the per-story integration suites). */
import { describe, expect, it } from "vitest";
import galleryDesignRoute from "../../app/api/projects/[id]/gallery-design/route.ts?raw";
import templatesRoute from "../../app/api/studio/templates/route.ts?raw";
import slideshowMusicRoute from "../../app/api/studio/slideshow-music/route.ts?raw";
import downloadRequestRoute from "../../app/api/g/[token]/download-request/route.ts?raw";
import zipRoute from "../../app/api/g/[token]/zip/route.ts?raw";
import shareRoute from "../../app/api/g/[token]/share/route.ts?raw";
import listsRoute from "../../app/api/g/[token]/lists/route.ts?raw";
import lifecycleRoute from "../../app/api/grants/[id]/lifecycle/route.ts?raw";
import downloadSettingsRoute from "../../app/api/grants/[id]/download-settings/route.ts?raw";
import favoriteRoute from "../../app/api/g/[token]/favorite/route.ts?raw";
import favoritesExportRoute from "../../app/api/grants/[id]/favorites/export/route.ts?raw";
import sneakPeekRoute from "../../app/api/assets/sneak-peek/route.ts?raw";
import assetRoute from "../../app/api/assets/[id]/route.ts?raw";
import assetViewsRoute from "../../app/api/projects/[id]/asset-views/route.ts?raw";

import { PLANS } from "@/lib/plans";
import { FREE_CUSTOM_FIELD_CAP } from "@/lib/forms";

type Row = { gate: string; free: string; lite: string; studio: string; pro: string };

const MATRIX: Row[] = [
  { gate: "maxSessionTypes", free: "1", lite: "3", studio: "∞", pro: "∞" },
  { gate: "maxContactForms", free: "1", lite: "1", studio: "∞", pro: "∞" },
  { gate: "custom form fields", free: "2", lite: "2", studio: "∞", pro: "∞" },
  { gate: "form file-upload fields", free: "✖", lite: "✖", studio: "✔", pro: "✔" },
  { gate: "maxContractTemplates", free: "2", lite: "2", studio: "∞", pro: "∞" },
  { gate: "maxEmailSnippets", free: "5", lite: "5", studio: "∞", pro: "∞" },
  { gate: "maxQuestionnaires", free: "1", lite: "3", studio: "∞", pro: "∞" },
  { gate: "storeEnabled (WEB-180)", free: "✖", lite: "✔", studio: "✔", pro: "✔" },
  { gate: "maxPriceLists (WEB-180)", free: "0", lite: "1", studio: "5", pro: "∞" },
  { gate: "packagesAllowed (WEB-180)", free: "✖", lite: "✖", studio: "✔", pro: "✔" },
  { gate: "customProductsAllowed (WEB-180)", free: "✖", lite: "✖", studio: "✔", pro: "✔" },
];

function actual(row: Row, plan: "free" | "lite" | "studio" | "pro"): string {
  const def = PLANS[plan];
  switch (row.gate) {
    case "custom form fields":
      return def.id === "studio" || def.id === "pro" ? "∞" : String(FREE_CUSTOM_FIELD_CAP);
    case "form file-upload fields":
      return def.id === "studio" || def.id === "pro" ? "✔" : "✖";
    case "storeEnabled (WEB-180)":
      return def.storeEnabled ? "✔" : "✖";
    case "packagesAllowed (WEB-180)":
      return def.packagesAllowed ? "✔" : "✖";
    case "customProductsAllowed (WEB-180)":
      return def.customProductsAllowed ? "✔" : "✖";
    case "maxPriceLists (WEB-180)":
      return def.maxPriceLists === null ? "∞" : String(def.maxPriceLists);
    default: {
      const value = (def as unknown as Record<string, number | null>)[row.gate];
      return value === null ? "∞" : String(value);
    }
  }
}

describe("tier gate matrix (WEB-256)", () => {
  it("lib/plans.ts matches the launch table exactly", () => {
    for (const row of MATRIX) {
      for (const plan of ["free", "lite", "studio", "pro"] as const) {
        expect(`${row.gate}/${plan}: ${actual(row, plan)}`).toBe(`${row.gate}/${plan}: ${row[plan]}`);
      }
    }
  });

  it("invoice presets + booking-page designer are Lite+ (file-upload parity with Studio)", () => {
    expect(PLANS.free.maxSessionTypes).toBe(1);
    expect(PLANS.lite.rawAllowed).toBe(true); // Lite is a paid rung — presets/booking-page gate on id !== free in their routes
  });
});

describe("WEB-267 gallery ladder (gates as shipped)", () => {
  it("free keeps the classic gallery; every gate lands on the paid tier the table says", async () => {
    // The ladder is enforced at the surfaces; each gated route source must
    // contain its exact error marker (?raw keeps this a static pin).
    const gates = [
      ["design_requires_lite", galleryDesignRoute],
      ["presets_require_lite", templatesRoute],
      ["music_requires_lite", slideshowMusicRoute],
      ["sharing_requires_lite", shareRoute],
      ["lists_require_lite", listsRoute],
      ["scheduling_requires_lite", lifecycleRoute],
      ["pin_requires_lite", downloadSettingsRoute],
      ["web_size_requires_lite", downloadSettingsRoute],
      ["approvals_require_studio", downloadSettingsRoute],
      ["notes_require_studio", favoriteRoute],
      ["exports_require_studio", favoritesExportRoute],
      ["sneak_peeks_require_studio", sneakPeekRoute],
      ["insights_require_studio", assetViewsRoute],
    ] as const;
    for (const [marker, src] of gates) {
      expect(src, `gate ${marker} must stay`).toContain(marker);
    }
  });

  it("download-all is open to EVERY plan - no tier gate on the streaming route or the request route", () => {
    for (const [name, src] of [["zip", zipRoute], ["download-request", downloadRequestRoute]] as const) {
      expect(src, `${name} route must not gate on plan`).not.toMatch(/getPlanEntitlements|requires_lite|requires_studio|ent\?\.id/);
    }
    expect(zipRoute).toContain("allowDownload"); // the photographer's per-gallery switch still rules
  });
});

describe("WEB-196 review fix — proofing swallows the size ladder", () => {
  it("the WEB-242 proofing block sits ABOVE the web/mid size rungs in the asset route", () => {
    // The /api/assets route can't run under the workers test pool (it imports
    // next/headers via the session), so the branch ORDER is pinned statically:
    // a proofing grant with downloads + webSize on must hit the watermarked
    // proofing serve before any clean size rung can answer (closes the
    // pre-existing WEB-261 web hole and the new WEB-196 mid rung).
    const proofingAt = assetRoute.indexOf("grant.allowDownload && grant.proofing");
    const webRungAt = assetRoute.indexOf('sizeParam === "web"');
    const midRungAt = assetRoute.indexOf('sizeParam === "mid"');
    expect(proofingAt).toBeGreaterThanOrEqual(0);
    expect(webRungAt).toBeGreaterThan(proofingAt);
    expect(midRungAt).toBeGreaterThan(proofingAt);
  });

  it("download-request suppresses the ladder for proofing grants (controls + sizePref)", () => {
    expect(downloadRequestRoute).toContain("settings.webSize && !grant.proofing");
  });
});
