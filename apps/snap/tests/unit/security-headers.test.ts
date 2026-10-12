/* WEB-202 baseline headers: everywhere, except the CSP on the self-framing widget surfaces. */
import { describe, expect, it } from "vitest";

import { baseSecurityHeaders, ownsFrameAncestors, withSecurityHeaders } from "@/lib/security-headers";

describe("baseSecurityHeaders", () => {
  it("sets the full baseline on app pages", () => {
    const h = baseSecurityHeaders("/dashboard", true);
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });

  it.each(["/embed/calendar", "/embed/contact", "/embed/loader.js", "/ts"])("leaves frame-ancestors to the route on %s", (p) => {
    expect(ownsFrameAncestors(p)).toBe(true);
    const h = baseSecurityHeaders(p, true);
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(h["X-Frame-Options"]).toBeUndefined();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it.each(["/embedded", "/tsx", "/b/studio", "/g/abc", "/api/embed/leads"])("still protects %s", (p) => {
    expect(ownsFrameAncestors(p)).toBe(false);
    expect(baseSecurityHeaders(p, true)["X-Frame-Options"]).toBe("SAMEORIGIN");
  });

  it("omits HSTS over plain http (localhost dev)", () => {
    expect(baseSecurityHeaders("/", false)["Strict-Transport-Security"]).toBeUndefined();
  });

  it("applies to redirects without clobbering other headers", () => {
    const res = withSecurityHeaders(new Response(null, { status: 307, headers: { Location: "/login" } }), "/dashboard", true);
    expect(res.headers.get("Location")).toBe("/login");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});
