/* WEB-330 host config - both hosts are always "the app", the legacy host
 * never stops working, and the single-constant flips behave. */
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_HOSTS, isCustomAppHost, isReservedHost, nonClientPathRedirect } from "@/lib/domains";
import {
  APP_HOSTS,
  EMAIL_DOMAIN,
  LEGACY_HOST,
  NEW_HOST,
  PUBLIC_HOST,
  PUBLIC_ORIGIN,
  emailAddress,
  isSnapMailDomain,
  originForHost,
  trustedAppOrigins,
  wwwRedirectTarget,
} from "@/lib/hosts";
import { extractSnapMessageIds, parseInboundAddress, threadAddress } from "@/lib/inbox/threading";

const THREAD = "0b9d2f3e-1c4a-4e5b-8f6a-7d8e9f0a1b2c";

describe("app host set", () => {
  it("serves BOTH the legacy and the new host (old links never die)", () => {
    for (const h of [LEGACY_HOST, NEW_HOST, `www.${NEW_HOST}`, "snap-staging.webcules.com", "staging.snaphq.app"]) {
      expect(DEFAULT_APP_HOSTS.has(h), h).toBe(true);
      expect(isCustomAppHost(h), h).toBe(false);
    }
    expect([...DEFAULT_APP_HOSTS].sort()).toEqual([...APP_HOSTS].sort());
  });

  it("studios can never claim a hostname under either of our zones", () => {
    for (const h of ["snaphq.app", "gallery.snaphq.app", "x.y.snaphq.app", "snap.webcules.com", "evil.webcules.com"]) {
      expect(isReservedHost(h), h).toBe(true);
    }
    expect(isReservedHost("gallery.yourstudio.com")).toBe(false);
    expect(isReservedHost("notsnaphq.app")).toBe(false);
  });

  it("the public host constants agree with each other and are one of ours", () => {
    expect(PUBLIC_ORIGIN).toBe(`https://${PUBLIC_HOST}`);
    expect([LEGACY_HOST, NEW_HOST]).toContain(PUBLIC_HOST);
    expect([LEGACY_HOST, NEW_HOST]).toContain(EMAIL_DOMAIN);
    expect(emailAddress("hello")).toBe(`hello@${EMAIL_DOMAIN}`);
  });
});

describe("serving guard redirects to the configured origin", () => {
  it("defaults to the public origin and honors an explicit one", () => {
    expect(nonClientPathRedirect("gallery.studio.com", "/dashboard")).toBe(`${PUBLIC_ORIGIN}/dashboard`);
    expect(nonClientPathRedirect("gallery.studio.com", "/login", "https://snaphq.app")).toBe("https://snaphq.app/login");
    expect(nonClientPathRedirect("snaphq.app", "/dashboard", "https://snaphq.app")).toBeNull();
    expect(nonClientPathRedirect("gallery.studio.com", "/g/abc", "https://snaphq.app")).toBeNull();
  });
});

describe("originForHost - embed loader origin", () => {
  it("echoes our own hosts so one script serves both domains", () => {
    expect(originForHost(LEGACY_HOST)).toBe(`https://${LEGACY_HOST}`);
    expect(originForHost(NEW_HOST)).toBe(`https://${NEW_HOST}`);
    expect(originForHost("SNAPHQ.app, proxy.example")).toBe(`https://${NEW_HOST}`);
  });

  it("never reflects a foreign or fallback-origin Host header", () => {
    expect(originForHost("evil.example")).toBe(PUBLIC_ORIGIN);
    expect(originForHost('x"};alert(1);//')).toBe(PUBLIC_ORIGIN);
    expect(originForHost("domains.snaphq.app")).toBe(PUBLIC_ORIGIN);
    expect(originForHost(null)).toBe(PUBLIC_ORIGIN);
  });
});

describe("trustedAppOrigins", () => {
  it("production trusts snaphq.app, www and the legacy host together", () => {
    const o = trustedAppOrigins("https://snaphq.app");
    expect(o).toEqual(expect.arrayContaining(["https://snaphq.app", "https://www.snaphq.app", `https://${LEGACY_HOST}`]));
    expect(o.some((x) => x.includes("staging"))).toBe(false);
    expect(trustedAppOrigins(`https://${LEGACY_HOST}`)).toEqual(expect.arrayContaining(["https://snaphq.app"]));
  });

  it("staging never trusts production hosts, and vice versa", () => {
    const o = trustedAppOrigins("https://snap-staging.webcules.com");
    expect(o).toEqual(expect.arrayContaining(["https://snap-staging.webcules.com", "https://staging.snaphq.app"]));
    expect(o).not.toContain("https://snaphq.app");
    expect(o).not.toContain(`https://${LEGACY_HOST}`);
  });

  it("an unknown or local URL stays narrow", () => {
    expect(trustedAppOrigins("http://localhost:3000")).toEqual(["http://localhost:3000"]);
    expect(trustedAppOrigins(undefined)).toEqual([]);
    expect(trustedAppOrigins("not a url")).toEqual([]);
  });
});

describe("email domain is snaphq.app only (no legacy mail)", () => {
  it("inbound routing accepts the Snap mail domain and nothing else", () => {
    expect(EMAIL_DOMAIN).toBe(NEW_HOST);
    expect(isSnapMailDomain(NEW_HOST)).toBe(true);
    expect(isSnapMailDomain(LEGACY_HOST)).toBe(false);
    expect(isSnapMailDomain("gmail.com")).toBe(false);
    expect(parseInboundAddress(`Studio <hello+bright-light@${NEW_HOST}>`)).toEqual({ kind: "slug", slug: "bright-light" });
    expect(parseInboundAddress(`t-${THREAD}-abc123xyz@${NEW_HOST}`)).toEqual({ kind: "thread", threadId: THREAD, token: "abc123xyz" });
    expect(parseInboundAddress(`hello+bright-light@${LEGACY_HOST}`)).toBeNull();
    expect(parseInboundAddress(`t-${THREAD}-abc123xyz@${LEGACY_HOST}`)).toBeNull();
    expect(parseInboundAddress("hello+bright-light@evil.example")).toBeNull();
  });

  it("outbound thread addresses and message ids use the Snap mail domain only", () => {
    expect(threadAddress(THREAD, "abc123xyz")).toBe(`t-${THREAD}-abc123xyz@${NEW_HOST}`);
    const body = `In-Reply-To: <a@${LEGACY_HOST}>\nReferences: <b@${NEW_HOST}> <c@other.example>`;
    expect(extractSnapMessageIds(body)).toEqual([`<b@${NEW_HOST}>`]);
  });
});

describe("www redirect", () => {
  it("sends www.snaphq.app pages to the apex, keeping path and query", () => {
    expect(wwwRedirectTarget("www.snaphq.app", "/g/abc", "?x=1")).toBe("https://snaphq.app/g/abc?x=1");
    expect(wwwRedirectTarget("WWW.snaphq.app:443", "/", "")).toBe("https://snaphq.app/");
  });

  it("never bounces API or embed paths, and ignores every other host", () => {
    for (const p of ["/api/stripe/webhook", "/api/assets/upload", "/embed/loader.js", "/embed"]) {
      expect(wwwRedirectTarget("www.snaphq.app", p), p).toBeNull();
    }
    for (const h of ["snaphq.app", "snap.webcules.com", "staging.snaphq.app", "www.example.com"]) {
      expect(wwwRedirectTarget(h, "/login"), h).toBeNull();
    }
  });
});
