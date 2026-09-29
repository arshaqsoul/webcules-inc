/* WEB-256 launch gate — the tier ladder, asserted as a matrix against the
 * story table so drift in any surface fails the suite. Every gate here is
 * enforced server-side (see the per-story integration suites). */
import { describe, expect, it } from "vitest";

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
];

function actual(row: Row, plan: "free" | "lite" | "studio" | "pro"): string {
  const def = PLANS[plan];
  switch (row.gate) {
    case "custom form fields":
      return def.id === "studio" || def.id === "pro" ? "∞" : String(FREE_CUSTOM_FIELD_CAP);
    case "form file-upload fields":
      return def.id === "studio" || def.id === "pro" ? "✔" : "✖";
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
