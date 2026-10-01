/* WEB-305 — composer primitives: the branded reply shell must escape client
 * and studio content (it's rendered by email clients, not sanitized on the
 * way out), and the business signature must stay honest — only what the
 * studio actually filled in, no fabricated lines. */
import { describe, expect, it } from "vitest";

import { businessSignature, buildReplyEmail } from "@/lib/inbox/compose";

describe("businessSignature", () => {
  it("falls back to the studio name alone when nothing else is set", () => {
    expect(businessSignature(null, "Willow and Pine")).toBe("Willow and Pine");
    expect(businessSignature("{}", "Willow and Pine")).toBe("Willow and Pine");
  });

  it("joins the identity the studio filled in, skipping blanks", () => {
    const biz = JSON.stringify({
      legalName: "Willow and Pine Photo LLC",
      addressLines: ["12 Elm St", "", "Springfield, OR"],
      phone: "+1 555 0100",
      website: "https://willowandpine.test",
    });
    const sig = businessSignature(biz, "Willow and Pine");
    expect(sig).toBe("Willow and Pine Photo LLC\n12 Elm St, Springfield, OR\n+1 555 0100\nhttps://willowandpine.test");
  });

  it("survives corrupt JSON without throwing", () => {
    expect(businessSignature("{oops", "Studio")).toBe("Studio");
  });
});

describe("buildReplyEmail", () => {
  const out = buildReplyEmail({
    studioName: "Willow & Pine",
    accent: "#5e6ad2",
    firstName: "Dana",
    body: "See you <on> the 14th — 6pm & bring the dog",
    signature: "Willow and Pine Photo LLC\n+1 555 0100",
  });

  it("escapes HTML-significant characters in body, name and signature", () => {
    expect(out.html).not.toContain("<on>");
    expect(out.html).toContain("See you &lt;on&gt; the 14th");
    expect(out.html).toContain("Willow &amp; Pine");
    expect(out.html).toContain("+1 555 0100");
  });

  it("the text twin carries the same content (clients without HTML)", () => {
    expect(out.text).toContain("Hi Dana,");
    expect(out.text).toContain("See you <on> the 14th");
    expect(out.text).toContain("Willow and Pine Photo LLC");
  });

  it("omits the signature row entirely when there is none", () => {
    const bare = buildReplyEmail({ studioName: "S", accent: "#000000", firstName: "D", body: "b", signature: "" });
    expect(bare.html).not.toMatch(/padding-top:24px;font-size:13px/);
    expect(bare.text).not.toContain("+1");
  });
});
