/* Plan null-safety — the "unlimited means null" contract (WEB-317 follow-up).
 *
 * The founder-reported bug class: a plan limit of `null` means UNLIMITED
 * (Studio/Pro), but `ent?.maxX ?? <number>` coerces that null into a hard
 * limit — the sidebar showed "1 studio on this plan" on Studio, and the
 * contracts page showed a 2-template cap on unlimited plans. This suite
 * (a) pins which fields are null-unlimited per plan so plan-data drift is
 * loud, and (b) greps every app/components source for the dangerous
 * `?? <number>` coercion on those fields, allowing only the verified-safe
 * guarded call sites. A new unguarded occurrence fails here before it can
 * leak a pricing tier into the UI. */
import { describe, expect, it } from "vitest";

import { PLANS, type PlanDef } from "@/lib/plans-data";

/* Nullable-unlimited plan fields — null on at least one paid tier means
 * "no limit", never "missing". maxActiveBookings is null EVERYWHERE
 * (bookings are unlimited on every plan) but stays in the scan: a
 * `?? <number>` on it would invent a cap out of nothing. */
const NULLABLE_UNLIMITED = [
  "maxActiveBookings",
  "maxActiveGalleries",
  "maxLinkedStudios",
  "maxSessionTypes",
  "maxContractTemplates",
  "maxEmailSnippets",
  "maxContactForms",
  "maxQuestionnaires",
] as const;
/** Finite on Free/Lite (the upsell edge), null on Studio/Pro. */
const PAID_UNLIMITED = NULLABLE_UNLIMITED.filter((f) => f !== "maxActiveBookings");

/** Verified-safe call sites: each guards the coercion behind an explicit
 * plan check (studio/pro → null) BEFORE the `?? n` can see a null. Edit
 * this table only with a matching code review — that is the point. */
const ALLOWED: Record<string, string> = {
  // `unlimited ? null : (ent?.maxContactForms ?? 1) : (ent?.maxQuestionnaires ?? 1)` — plan-guarded
  "../../app/api/studio/templates/route.ts": "plan-guarded limits (unlimited → null before the fallback)",
  // duplicate gate mirrors the create gate: `unlimited ? null : (… ?? n)`
  "../../app/api/studio/templates/[id]/route.ts": "plan-guarded duplicate limits",
  // `ent ? (studio||pro ? null : ent.maxContractTemplates ?? 2) : 2` — ent- and plan-guarded
  "../../app/dashboard/templates/contracts/page.tsx": "ent- and plan-guarded limit",
  // `ent && id !== studio/pro ? (ent.maxEmailSnippets ?? 5) : null` — plan-guarded
  "../../app/dashboard/settings/brand/page.tsx": "plan-guarded snippet limit",
  "../../app/dashboard/templates/emails/page.tsx": "plan-guarded snippet limit",
};

const modules = import.meta.glob("../../app/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const compModules = import.meta.glob("../../components/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sources = { ...modules, ...compModules };

describe("plan-data: null means unlimited", () => {
  it("Studio and Pro are unlimited where they claim to be (pricing-copy parity)", () => {
    for (const id of ["studio", "pro"] as const) {
      const def: PlanDef = PLANS[id];
      for (const f of NULLABLE_UNLIMITED) {
        expect(def[f], `${id}.${f} must be null (unlimited) — pricing copy says so`).toBeNull();
      }
    }
  });

  it("Free and Lite carry finite limits on those fields (the upsell edge)", () => {
    for (const id of ["free", "lite"] as const) {
      const def: PlanDef = PLANS[id];
      for (const f of PAID_UNLIMITED) {
        expect(def[f], `${id}.${f} must be a number on the gated tiers`).toBeTypeOf("number");
      }
      expect(def.maxActiveBookings, "bookings are unlimited on every plan").toBeNull();
    }
  });
});

describe("call sites: no unguarded `?? <number>` on nullable-unlimited fields", () => {
  const pattern = new RegExp(`(?:${NULLABLE_UNLIMITED.join("|")})\\s*\\?\\?\\s*\\d`);

  it("every app/components source is free of the coercion outside the audited sites", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      if (path.includes(".test.") || path.includes(".d.ts")) continue;
      const lineNumbers = src
        .split("\n")
        .map((line, i) => (pattern.test(line) ? `${path}:${i + 1}: ${line.trim().slice(0, 100)}` : null))
        .filter((x): x is string => x !== null);
      if (lineNumbers.length && !(path in ALLOWED)) offenders.push(...lineNumbers);
    }
    expect(
      offenders,
      "A plan limit of null means UNLIMITED — `?? <number>` coerces it into a hard cap. Guard the site with a plan check (see ALLOWED entries) or use `ent ? ent.maxX : <n>`.",
    ).toEqual([]);
  });

  it("the audited sites still exist (stale allowlist entries are removed)", () => {
    for (const [path] of Object.entries(ALLOWED)) {
      const src = sources[path];
      expect(src, `${path} allowlisted but missing`).toBeDefined();
      expect(pattern.test(src ?? ""), `${path} allowlisted but no longer needs it — prune`).toBe(true);
    }
  });
});

describe("role gates: mutating studio APIs check permissionDenied", () => {
  const GATED = [
    "app/api/studio/domains/route.ts",
    "app/api/studio/domains/[id]/route.ts",
    "app/api/studio/embed/route.ts",
    "app/api/studio/invoice-settings/route.ts",
    "app/api/studio/email-overrides/route.ts",
    "app/api/studio/watermark/route.ts",
    "app/api/studio/watermark/assets/route.ts",
    "app/api/studio/session-types/route.ts",
    "app/api/studio/session-types/[id]/route.ts",
    "app/api/studio/templates/route.ts",
    "app/api/studio/templates/[id]/route.ts",
    "app/api/studio/availability/route.ts",
    "app/api/studio/booking-page/route.ts",
    "app/api/studio/brand-assets/route.ts",
    "app/api/studio/slideshow-music/route.ts",
    "app/api/studio/slideshow-music/[id]/route.ts",
    "app/api/studio/raw-vault/route.ts",
  ];
  it("every listed route imports and calls permissionDenied", () => {
    const missing: string[] = [];
    for (const rel of GATED) {
      const key = `../../${rel}`;
      const src = sources[key];
      if (!src || !/permissionDenied\(ctx,/.test(src)) missing.push(rel);
    }
    expect(missing, "routes missing the member-role gate (audit P1)").toEqual([]);
  });
});
