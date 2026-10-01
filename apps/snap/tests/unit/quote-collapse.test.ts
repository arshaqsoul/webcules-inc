/* WEB-305 — render-time quote collapse: the display split must hide Gmail /
 * Outlook / signature noise behind the toggle while storage (and the
 * un-split text) keeps everything. Bottom-posters lose nothing: content
 * after a leading quote block stays visible. */
import { describe, expect, it } from "vitest";

import { splitReplyForDisplay, stripQuotedReply } from "@/lib/strip-reply";

describe("splitReplyForDisplay", () => {
  it("splits a Gmail reply at the 'On … wrote:' line", () => {
    const text = "Thanks, that works!\n\nOn Fri, Sep 25, 2026 at 10:43 AM <dana@t.test> wrote:\n> original message\n> more";
    const { visible, trimmed } = splitReplyForDisplay(text);
    expect(visible).toBe("Thanks, that works!");
    expect(trimmed).toContain("On Fri, Sep 25, 2026");
    expect(trimmed).toContain("> original message");
  });

  it("handles the multi-line Gmail header split across lines", () => {
    const text = "Yes\n\nOn Sep 25, 2026, at 10:43 AM,\nDana <dana@t.test>\nwrote:\n> hi";
    const { visible, trimmed } = splitReplyForDisplay(text);
    expect(visible).toBe("Yes");
    expect(trimmed).toContain("wrote:");
  });

  it("splits Outlook From:/Sent: header blocks", () => {
    const text = "Confirmed!\n\nFrom: Dana Doe <dana@t.test>\nSent: Friday, September 25, 2026 10:43 AM\nTo: Me\nSubject: Re: photos\n\nfirst message";
    const { visible, trimmed } = splitReplyForDisplay(text);
    expect(visible).toBe("Confirmed!");
    expect(trimmed).toContain("From: Dana Doe");
  });

  it("collapses '-- ' signature delimiters", () => {
    const text = "Sounds good.\n-- \nDana Doe\nDana Doe Photography";
    const { visible, trimmed } = splitReplyForDisplay(text);
    expect(visible).toBe("Sounds good.");
    expect(trimmed).toContain("Dana Doe Photography");
  });

  it("bottom-posted replies keep the new content below the quote block", () => {
    const text = "On Sep 24 someone wrote:\n> old question\n\nmy answer is here";
    // A leading quote with no content above it → nothing to collapse to; the
    // display falls back to the full text rather than hiding everything.
    const { visible, trimmed } = splitReplyForDisplay(text);
    expect(visible).toContain("my answer is here");
    expect(trimmed).toBeNull();
  });

  it("returns trimmed=null for clean messages", () => {
    const { visible, trimmed } = splitReplyForDisplay("Just a plain message.\nSecond line.");
    expect(visible).toBe("Just a plain message.\nSecond line.");
    expect(trimmed).toBeNull();
  });

  it("agrees with stripQuotedReply: the visible half IS the stripped body", () => {
    const corpus = [
      "a\n\nOn X <y@z> wrote:\n> q",
      "b\n\nFrom: a@b\nSent: whenever\n> q",
      "c\n-- \nsig",
      "plain only",
    ];
    for (const text of corpus) {
      expect(splitReplyForDisplay(text).visible).toBe(stripQuotedReply(text));
    }
  });

  it("never loses content: visible + trimmed covers the original lines", () => {
    const text = "top\n\nOn X <y@z> wrote:\n> quoted\n> more";
    const { visible, trimmed } = splitReplyForDisplay(text);
    expect(`${visible}\n${trimmed ?? ""}`).toContain("top");
    expect(`${visible}\n${trimmed ?? ""}`).toContain("quoted");
    expect(`${visible}\n${trimmed ?? ""}`).toContain("more");
  });
});
