/* WEB-307 — the threading primitives, against the corpus shapes the wild
 * sends us: RFC id chains, Outlook Thread-Index, localized subjects,
 * per-thread addresses, DSN envelopes, Gmail auto-forward wraps. */
import { describe, expect, it } from "vitest";

import {
  baseSubject,
  extractSnapMessageIds,
  looksLikeDsn,
  mintThreadIndex,
  parseInboundAddress,
  parseMessageIds,
  refreshThreadIndexBase64,
  threadIndexGuid,
  unwrapForwardedSender,
} from "@/lib/inbox/threading";

describe("parseMessageIds", () => {
  it("extracts <id> tokens from In-Reply-To and References values", () => {
    expect(parseMessageIds("<a@snaphq.app>")).toEqual(["<a@snaphq.app>"]);
    expect(parseMessageIds('  <a@x> "<b@y>" <c@z> ')).toEqual(["<a@x>", "<b@y>", "<c@z>"]);
    expect(parseMessageIds(null)).toEqual([]);
    expect(parseMessageIds("no ids here")).toEqual([]);
  });
});

describe("baseSubject (RFC 5256-ish)", () => {
  it("strips repeated and localized prefixes, lowercases", () => {
    expect(baseSubject("Re: Wedding inquiry")).toBe("wedding inquiry");
    expect(baseSubject("RE: FWD: re: Wedding inquiry")).toBe("wedding inquiry");
    expect(baseSubject("AW: Anfrage")).toBe("anfrage");
    expect(baseSubject("Fw: [external] Quote?")).toBe("quote?");
  });
  it("leaves plain subjects intact and tolerates empties", () => {
    expect(baseSubject("Wedding inquiry")).toBe("wedding inquiry");
    expect(baseSubject("")).toBe("");
    expect(baseSubject(null)).toBe("");
  });
});

describe("Thread-Index", () => {
  it("mints 22-byte indexes whose GUID half survives clock refreshes", () => {
    const minted = mintThreadIndex();
    expect(threadIndexGuid(minted.base64)).toBe(minted.guidHex);
    const refreshed = refreshThreadIndexBase64(minted.guidHex);
    expect(threadIndexGuid(refreshed)).toBe(minted.guidHex); // Outlook rewrites the clock, not the GUID
  });
  it("rejects malformed/short headers", () => {
    expect(threadIndexGuid(null)).toBeNull();
    expect(threadIndexGuid("")).toBeNull();
    expect(threadIndexGuid("!!!not-base64!!!")).toBeNull();
    expect(threadIndexGuid(btoa("short"))).toBeNull();
  });
});

describe("parseInboundAddress", () => {
  const threadId = "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";
  it("routes the per-thread, per-lead and studio-slug local-parts", () => {
    expect(parseInboundAddress(`t-${threadId}-ab12cd34@snaphq.app`)).toEqual({
      kind: "thread",
      threadId,
      token: "ab12cd34",
    });
    expect(parseInboundAddress(`hello+${threadId}@snaphq.app`)).toEqual({
      kind: "lead",
      leadId: threadId,
    });
    expect(parseInboundAddress("hello+willow-pine@snaphq.app")).toEqual({
      kind: "slug",
      slug: "willow-pine",
    });
  });
  it("tolerates display names, multiple recipients, and foreign mail", () => {
    expect(parseInboundAddress(`"Dana" <t-${threadId}-ab12cd34@snaphq.app>, other@x.test`)).toEqual({
      kind: "thread",
      threadId,
      token: "ab12cd34",
    });
    expect(parseInboundAddress("someone@gmail.com")).toBeNull();
    expect(parseInboundAddress(null)).toBeNull();
  });
});

describe("DSN detection", () => {
  it("flags mailer-daemon envelopes and multipart/report", () => {
    expect(looksLikeDsn({ from: "MAILER-DAEMON@mx.google.com", subject: "Delivery Status Notification" })).toBe(true);
    expect(looksLikeDsn({ from: "x@y.test", contentType: "multipart/report; report-type=delivery-status" })).toBe(true);
    expect(looksLikeDsn({ from: "client@t.test", subject: "Re: photos" })).toBe(false);
    // Auto-submitted alone is not a bounce (vacation replies)…
    expect(looksLikeDsn({ from: "client@t.test", autoSubmitted: true, subject: "Out of office" })).toBe(false);
    // …unless it says delivery failure.
    expect(looksLikeDsn({ from: "client@t.test", autoSubmitted: true, subject: "Undeliverable: your reply" })).toBe(true);
  });
  it("extracts only snap's own message ids from a DSN body", () => {
    const body = "Failed recipient: dana@t.test\n for message <abc@snaphq.app> and <other@elsewhere.test>";
    expect(extractSnapMessageIds(body)).toEqual(["<abc@snaphq.app>"]);
  });
});

describe("Gmail auto-forward unwrap", () => {
  it("unwraps the original sender when auto-submitted + X-Forwarded-For", () => {
    expect(
      unwrapForwardedSender({ from: "studio@gmail.com", autoSubmitted: true, xForwardedFor: "dana@t.test" }),
    ).toBe("dana@t.test");
    // No auto-submission → not a forward, keep the envelope sender.
    expect(unwrapForwardedSender({ from: "studio@gmail.com", xForwardedFor: "dana@t.test" })).toBeNull();
    expect(unwrapForwardedSender({ from: "x@y.test" })).toBeNull();
  });
});
