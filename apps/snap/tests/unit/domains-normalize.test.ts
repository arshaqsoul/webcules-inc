/* Hostname normalization table (WEB-225) — pure lib/domains.ts behavior:
 * URL forms normalize, junk rejects with distinct reasons, subdomain-only. */
import { describe, expect, it } from "vitest";
import { PUBLIC_ORIGIN } from "@/lib/hosts";

import {
  CNAME_TARGET,
  isReservedHost,
  newVerificationToken,
  normalizeHostname,
  txtMatches,
  verificationTxtName,
  isCustomAppHost,
  nonClientPathRedirect, requestHost } from "@/lib/domains";

describe("normalizeHostname", () => {
  const ok = (input: string, expected: string) =>
    it(`${input} → ${expected}`, () => {
      expect(normalizeHostname(input)).toEqual({ ok: true, hostname: expected });
    });
  const bad = (input: string, error: string) =>
    it(`${input} → ${error}`, () => {
      const r = normalizeHostname(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe(error);
    });

  // accepted — URL junk stripped, case folded, trailing dot dropped
  ok("gallery.studio.com", "gallery.studio.com");
  ok("GALLERY.Studio.COM", "gallery.studio.com");
  ok("https://gallery.studio.com", "gallery.studio.com");
  ok("https://gallery.studio.com/", "gallery.studio.com");
  ok("http://gallery.studio.com/some/path?x=1#frag", "gallery.studio.com");
  ok("https://user:pass@gallery.studio.com/", "gallery.studio.com");
  ok("gallery.studio.com.", "gallery.studio.com");
  ok("  gallery.studio.com  ", "gallery.studio.com");
  ok("galeria.xn--estudio-8db.com", "galeria.xn--estudio-8db.com"); // punycode as-is
  ok("photos.gallery.studio.co.uk", "photos.gallery.studio.co.uk"); // deep subdomain

  // rejected — format
  bad("", "invalid_hostname");
  bad("   ", "invalid_hostname");
  bad("not a hostname", "invalid_hostname");
  bad("gallery..studio.com", "invalid_hostname");
  bad("gallery.studio.com:8443", "port_not_allowed");
  bad("[::1]", "invalid_hostname");
  // rejected — addresses
  bad("192.168.1.1", "ip_not_allowed");
  bad("127.0.0.1", "ip_not_allowed");
  bad("0x7f.0.0.1", "ip_not_allowed");
  // rejected — our zone / localhost (reserved fires before the apex check)
  bad("webcules.com", "reserved");
  bad("snap.webcules.com", "reserved");
  bad("snap-fallback.webcules.com", "reserved");
  bad("snap-saas-origin.webcules.com", "reserved");
  bad("domains.snaphq.app", "reserved");
  bad("anything.webcules.com", "reserved");
  bad("localhost", "reserved");
  // rejected — subdomain-only policy
  bad("studio.com", "apex_not_supported");
  bad("https://brightlightstudio.com", "apex_not_supported");
  bad("com", "apex_not_supported");
  // rejected — labels
  bad("*.studio.com", "invalid_label");
  bad("my gallery.studio.com", "invalid_hostname"); // space = junk char
  bad("_dmarc.studio.com", "invalid_label");
  bad("-lead.studio.com", "invalid_label");
  bad(`a".studio.com`, "invalid_label"); // quote fails the label charset
});

describe("reserved hosts", () => {
  it("our zone and localhost variants", () => {
    expect(isReservedHost("webcules.com")).toBe(true);
    expect(isReservedHost("snap.webcules.com")).toBe(true);
    expect(isReservedHost("foo.bar.webcules.com")).toBe(true);
    expect(isReservedHost("localhost")).toBe(true);
    expect(isReservedHost("sub.localhost")).toBe(true);
    expect(isReservedHost("gallery.studio.com")).toBe(false);
    expect(isReservedHost("webcules.co")).toBe(false);
  });
});

describe("length limits", () => {
  it("rejects hostnames over 253 chars", () => {
    const long = `${"a".repeat(62)}.${"b".repeat(62)}.${"c".repeat(62)}.${"d".repeat(62)}.com`;
    expect(long.length).toBe(255);
    const r = normalizeHostname(long);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_long");
  });

  it("accepts a 253-char hostname (labels ≤ 63)", () => {
    const host = `${"a".repeat(62)}.${"b".repeat(62)}.${"c".repeat(62)}.${"d".repeat(60)}.com`;
    expect(host.length).toBe(253);
    expect(normalizeHostname(host)).toEqual({ ok: true, hostname: host });
  });
});

describe("verification records", () => {
  it("TXT name is _snap-verify under the hostname", () => {
    expect(verificationTxtName("gallery.studio.com")).toBe("_snap-verify.gallery.studio.com");
  });

  it("tokens are snap-verify=<32 hex> and unique", () => {
    const t1 = newVerificationToken();
    const t2 = newVerificationToken();
    expect(t1).toMatch(/^snap-verify=[0-9a-f]{32}$/);
    expect(t1).not.toBe(t2);
  });

  it("txtMatches requires the exact token string among answers", () => {
    expect(txtMatches("snap-verify=abc", ["snap-verify=abc"])).toBe(true);
    expect(txtMatches("snap-verify=abc", ['"snap-verify=abc"', "other"])).toBe(false); // quotes = not exact
    expect(txtMatches("snap-verify=abc", ["other"])).toBe(false);
    expect(txtMatches("snap-verify=abc", null)).toBe(false);
  });

  it("CNAME target is the fallback origin hostname", () => {
    expect(CNAME_TARGET).toBe("domains.snaphq.app");
  });
});

describe("requestHost (SaaS X-Forwarded-Host)", () => {
  it("prefers x-forwarded-host — the SaaS fallback-origin leg carries the studio host there", () => {
    expect(requestHost(new Headers({ host: "domains.snaphq.app", "x-forwarded-host": "gallery.studio.com" }))).toBe("gallery.studio.com");
  });
  it("first value of a comma list; plain Host when absent", () => {
    expect(requestHost(new Headers({ "x-forwarded-host": "gallery.studio.com, proxy.example" }))).toBe("gallery.studio.com");
    expect(requestHost(new Headers({ host: "snap.webcules.com" }))).toBe("snap.webcules.com");
    expect(requestHost(new Headers({}))).toBeNull();
  });
});

describe("serving guard (WEB-227)", () => {
  it("custom host + non-client path → 302 target on the main origin", () => {
    expect(nonClientPathRedirect("gallery.studio.com", "/dashboard")).toBe(`${PUBLIC_ORIGIN}/dashboard`);
    expect(nonClientPathRedirect("gallery.studio.com", "/dashboard/settings/general")).toBe(`${PUBLIC_ORIGIN}/dashboard/settings/general`);
    expect(nonClientPathRedirect("gallery.studio.com", "/login")).toBe(`${PUBLIC_ORIGIN}/login`);
    expect(nonClientPathRedirect("gallery.studio.com", "/embed/loader.js")).toBe(`${PUBLIC_ORIGIN}/embed/loader.js`);
    expect(nonClientPathRedirect("gallery.studio.com", "/api/studio/brand")).toBe(`${PUBLIC_ORIGIN}/api/studio/brand`);
    expect(nonClientPathRedirect("gallery.studio.com", "/docs/embeds")).toBe(`${PUBLIC_ORIGIN}/docs/embeds`);
  });

  it("client-facing paths pass through on ANY host", () => {
    for (const p of ["/g/abc123", "/b/studio-slug", "/inv/tok", "/c/tok", "/portal/login", "/api/assets/x", "/api/embed/logo", "/api/embed/ics", "/api/g/x", "/", "/booking/success"]) {
      expect(nonClientPathRedirect("gallery.studio.com", p)).toBeNull();
    }
  });

  it("default/dev/preview hosts never redirect", () => {
    for (const h of ["snap.webcules.com", "domains.snaphq.app", "localhost:8787", "127.0.0.1", "snap.webcules-inc.workers.dev"]) {
      expect(nonClientPathRedirect(h, "/dashboard")).toBeNull();
      expect(isCustomAppHost(h)).toBe(false);
    }
    // IPv6 loopback literals (what Node/browsers send for localhost over ::1)
    // are dev hosts — never treated as a studio custom hostname (WEB-233:
    // this exact case 307'd dev traffic at the production origin).
    for (const h of ["[::1]:3000", "[::1]", "[2001:db8::1]:8787"]) {
      if (h === "[2001:db8::1]:8787") {
        expect(isCustomAppHost(h)).toBe(true); // a real IPv6 address is not loopback
        continue;
      }
      expect(isCustomAppHost(h)).toBe(false);
      expect(nonClientPathRedirect(h, "/dashboard")).toBeNull();
    }
    expect(isCustomAppHost("gallery.studio.com")).toBe(true);
    expect(isCustomAppHost("GALLERY.Studio.COM")).toBe(true);
  });

  it("prefix matching is exact — /dashboardx and /loginx pass through", () => {
    expect(nonClientPathRedirect("gallery.studio.com", "/dashboardx")).toBeNull();
    expect(nonClientPathRedirect("gallery.studio.com", "/loginx")).toBeNull();
  });
});

describe("gallery cookie scoping (WEB-227)", () => {
  it("minted cookies are host-only — no Domain attribute pins them to snap.webcules.com", async () => {
    const { mintGalleryCookie } = await import("@/lib/shares/gallery-auth");
    const cookie = await mintGalleryCookie("9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f");
    expect(cookie).toContain("snap-g=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain="); // host-only: scopes to the custom host that served it
  });
});
