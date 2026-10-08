/* WEB-333 Turnstile bridge - custom hostnames never register with Turnstile. */
import { describe, expect, it } from "vitest";

import { nonClientPathRedirect } from "@/lib/domains";
import { APP_HOSTS, PUBLIC_ORIGIN } from "@/lib/hosts";
import {
  TS_MESSAGE_TYPE,
  bridgeUrl,
  frameAncestorsFor,
  isPlainHostname,
  needsBridge,
  parseBridgeMessage,
} from "@/lib/turnstile-bridge";

describe("needsBridge", () => {
  it("our own hosts and local dev render natively", () => {
    for (const h of [...APP_HOSTS, "localhost", "127.0.0.1", "snap.something.workers.dev", "x.localhost"]) {
      expect(needsBridge(h), h).toBe(false);
    }
    expect(needsBridge("SNAPHQ.APP")).toBe(false);
  });

  it("every studio custom hostname uses the bridge", () => {
    for (const h of ["gallery.studio.com", "photos.veloraphotography.ca", "gallery-test.prairiepeakgear.com"]) {
      expect(needsBridge(h), h).toBe(true);
    }
  });
});

describe("bridge url + csp", () => {
  it("points at the main origin and encodes the host", () => {
    expect(bridgeUrl("Gallery.Studio.com")).toBe(`${PUBLIC_ORIGIN}/ts?o=gallery.studio.com`);
  });

  it("frames only the one vouched host", () => {
    expect(frameAncestorsFor("Gallery.Studio.com")).toBe("frame-ancestors https://gallery.studio.com");
  });

  it("accepts plain hostnames and rejects anything that could widen the policy", () => {
    expect(isPlainHostname("gallery.studio.com")).toBe(true);
    for (const bad of ["", "localhost", "https://a.com", "a.com/path", "a.com:8080", "*.a.com", "a.com; frame-ancestors *", "a b.com", "-a.com", "a..com"]) {
      expect(isPlainHostname(bad), bad).toBe(false);
    }
  });
});

describe("parseBridgeMessage", () => {
  it("reads tokens and expiry, ignores everything else", () => {
    expect(parseBridgeMessage({ type: TS_MESSAGE_TYPE, token: "abc" })).toEqual({ kind: "token", token: "abc" });
    expect(parseBridgeMessage({ type: TS_MESSAGE_TYPE, state: "expired" })).toEqual({ kind: "expired" });
    expect(parseBridgeMessage({ type: TS_MESSAGE_TYPE, state: "error" })).toEqual({ kind: "error" });
    expect(parseBridgeMessage({ type: "other", token: "abc" })).toBeNull();
    expect(parseBridgeMessage({ type: TS_MESSAGE_TYPE, token: "" })).toBeNull();
    expect(parseBridgeMessage({ type: TS_MESSAGE_TYPE, token: "x".repeat(5000) })).toBeNull();
    expect(parseBridgeMessage({ type: TS_MESSAGE_TYPE, token: 7 })).toBeNull();
    expect(parseBridgeMessage(null)).toBeNull();
    expect(parseBridgeMessage("snap:turnstile")).toBeNull();
  });
});

describe("serving guard", () => {
  it("/ts is main-origin only, so a custom host is sent to snaphq.app", () => {
    expect(nonClientPathRedirect("gallery.studio.com", "/ts")).toBe(`${PUBLIC_ORIGIN}/ts`);
  });
});
