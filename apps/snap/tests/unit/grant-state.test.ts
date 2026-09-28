/* Grant lifecycle state machine (pure half of lib/shares/grants). */
import { describe, expect, it } from "vitest";

import { grantIsEffectivelyActive, grantState, type GrantLike } from "@/lib/shares/grants";

const H = 3600_000;
const grant = (status: string, expiresAt: Date | null): GrantLike => ({ status, expiresAt });

describe("grantState", () => {
  it("revoked and regenerated win over everything", () => {
    expect(grantState(grant("revoked", new Date(Date.now() + H)))).toBe("revoked");
    expect(grantState(grant("regenerated", new Date(Date.now() + H)))).toBe("regenerated");
  });

  it("expired when expiresAt has passed; expiring_soon inside the 7-day band; active beyond", () => {
    expect(grantState(grant("active", new Date(Date.now() - 1000)))).toBe("expired");
    expect(grantState(grant("active", new Date(Date.now() + H)))).toBe("expiring_soon");
    expect(grantState(grant("active", new Date(Date.now() + 30 * 24 * H)))).toBe("active");
  });

  it("never-expiring grants stay active", () => {
    expect(grantState(grant("active", null))).toBe("active");
  });
});

describe("grantIsEffectivelyActive", () => {
  it("true only for status=active with a future-or-null expiry", () => {
    expect(grantIsEffectivelyActive(grant("active", null))).toBe(true);
    expect(grantIsEffectivelyActive(grant("active", new Date(Date.now() + H)))).toBe(true);
    expect(grantIsEffectivelyActive(grant("active", new Date(Date.now() - H)))).toBe(false);
    expect(grantIsEffectivelyActive(grant("revoked", null))).toBe(false);
    expect(grantIsEffectivelyActive(grant("regenerated", null))).toBe(false);
  });
});
