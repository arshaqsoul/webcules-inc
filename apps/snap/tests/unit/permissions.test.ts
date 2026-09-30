/* WEB-275 — the role/permission matrix: solo owner studios pass everything
 * (zero-diff), members lose money/settings surfaces, admins keep the studio
 * but not the bill. */
import { describe, expect, it } from "vitest";

import { can, canAccessRawVault, normalizeRole } from "@/lib/permissions";

const ALL = [
  "settings.read",
  "settings.write",
  "billing.read",
  "billing.write",
  "documents.manage",
  "team.manage",
  "rawvault.read",
  "work.manage",
  "analytics.read",
] as const;

describe("can (WEB-275 matrix)", () => {
  it("owner passes every permission (existing solo studios: zero behavior change)", () => {
    for (const p of ALL) expect(can("owner", p)).toBe(true);
  });

  it("admin manages the studio but not the bill", () => {
    expect(can("admin", "settings.read")).toBe(true);
    expect(can("admin", "settings.write")).toBe(true);
    expect(can("admin", "documents.manage")).toBe(true);
    expect(can("admin", "team.manage")).toBe(true);
    expect(can("admin", "rawvault.read")).toBe(true);
    expect(can("admin", "billing.read")).toBe(false);
    expect(can("admin", "billing.write")).toBe(false);
  });

  it("member works the business, never the money or settings", () => {
    expect(can("member", "work.manage")).toBe(true);
    expect(can("member", "analytics.read")).toBe(true);
    for (const p of ALL) {
      if (p === "work.manage" || p === "analytics.read") continue;
      expect(can("member", p), p).toBe(false);
    }
  });

  it("unknown roles collapse to member (fail closed)", () => {
    expect(normalizeRole("superuser")).toBe("member");
    expect(normalizeRole(null)).toBe("member");
    expect(can("superuser", "settings.read")).toBe(false);
  });
});

describe("canAccessRawVault", () => {
  it("owner/admin always; member only via the per-org toggle", () => {
    expect(canAccessRawVault("owner", false)).toBe(true);
    expect(canAccessRawVault("admin", false)).toBe(true);
    expect(canAccessRawVault("member", false)).toBe(false);
    expect(canAccessRawVault("member", true)).toBe(true);
  });
});
