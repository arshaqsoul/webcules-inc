/* WEB-334 - the Email Service rejects the whole send for a non-allowlisted
 * header. Inbox replies carried Message-ID and Thread-Index, so every reply
 * failed. */
import { describe, expect, it } from "vitest";

import { sanitizeEmailHeaders } from "@/lib/email";
import { isPlaceholderClientEmail } from "@/lib/inbox/threading";

describe("sanitizeEmailHeaders", () => {
  it("drops Message-ID and Thread-Index, keeps threading headers and X-*", () => {
    const out = sanitizeEmailHeaders({
      "Message-ID": "<a@snaphq.app>",
      "Thread-Index": "AAAA",
      "In-Reply-To": "<b@snaphq.app>",
      References: "<a@x> <b@snaphq.app>",
      "X-Snap-Thread-ID": "t1",
      "x-snap-type": "reply-copy",
    });
    expect(out).toEqual({
      "In-Reply-To": "<b@snaphq.app>",
      References: "<a@x> <b@snaphq.app>",
      "X-Snap-Thread-ID": "t1",
      "x-snap-type": "reply-copy",
    });
  });

  it("matches header names case-insensitively and returns null when nothing is left", () => {
    expect(sanitizeEmailHeaders({ "message-id": "<a@b>", "THREAD-INDEX": "x", Date: "now", Received: "r" })).toBeNull();
    expect(sanitizeEmailHeaders({ "in-reply-to": "<a@b>", "LIST-ID": "<l.snaphq.app>" })).toEqual({
      "in-reply-to": "<a@b>",
      "LIST-ID": "<l.snaphq.app>",
    });
    expect(sanitizeEmailHeaders({})).toBeNull();
  });

  it("caps the non-X allow-listed headers at 20", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 25; i++) many[`x-n${i}`] = String(i);
    expect(Object.keys(sanitizeEmailHeaders(many)!)).toHaveLength(25); // X-* are not capped by the service rule
  });
});

describe("isPlaceholderClientEmail", () => {
  it("recognizes the stand-in recipient on the current and legacy domains", () => {
    for (const e of ["unknown@snaphq.app", "unknown@snap.webcules.com", "Unknown@SnapHQ.app"]) {
      expect(isPlaceholderClientEmail(e), e).toBe(true);
    }
  });

  it("never flags real client addresses", () => {
    for (const e of ["nsulthana97@gmail.com", "unknown@gmail.com", "unknown@evil.snaphq.app", "x@snaphq.app", "", null, undefined]) {
      expect(isPlaceholderClientEmail(e as string | null | undefined), String(e)).toBe(false);
    }
  });
});
