/* stripQuotedReply — inbound email thread hygiene. */
import { describe, expect, it } from "vitest";

import { stripQuotedReply } from "@/lib/strip-reply";

describe("stripQuotedReply", () => {
  it("empty input", () => {
    expect(stripQuotedReply("")).toBe("");
  });

  it("keeps plain content untouched", () => {
    const text = "Hi!\n\nLoved the gallery — can we book October?";
    expect(stripQuotedReply(text)).toBe(text);
  });

  it("cuts Gmail-style 'On … wrote:' history (single line)", () => {
    const text = "Thanks, that works.\n\nOn Fri, Sep 25, 2026 at 10:43 PM <priya@x.com> wrote:\n> See you then";
    expect(stripQuotedReply(text)).toBe("Thanks, that works.");
  });

  it("cuts Gmail history split across two lines", () => {
    const text = "Thanks!\nOn Fri, Sep 25, 2026 at 10:43 PM <\npriya@x.com> wrote:\n> quoted";
    expect(stripQuotedReply(text)).toBe("Thanks!");
  });

  it("cuts Outlook From:/Sent: blocks", () => {
    const text = "Sounds good.\n\nFrom: Priya <priya@x.com>\nSent: Friday, September 25, 2026 10:43 AM\nTo: Me\n\noriginal message";
    expect(stripQuotedReply(text)).toBe("Sounds good.");
  });

  it("cuts a solid block of '> ' quoted lines", () => {
    const text = "New reply\n> first quoted line\n> second quoted line";
    expect(stripQuotedReply(text)).toBe("New reply");
  });

  it("cuts at the signature delimiter '--'", () => {
    const text = "Signed reply\n-- \nPriya Photography";
    expect(stripQuotedReply(text)).toBe("Signed reply");
  });

  it("keeps a lone '>' line that is not a quote block (errs toward keeping)", () => {
    const text = "See below\n> single line standalonew";
    // a single '>' line with a non-quote following line stays (heuristic keeps content)
    expect(stripQuotedReply(text)).toContain("See below");
  });
});
