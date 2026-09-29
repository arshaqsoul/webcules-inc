/* WEB-254 booking page designer — config validation, defaults unchanged,
 * section rendering on /b/{slug}, OG copy, thanks on the success page. */
import { EMPTY_BOOKING_PAGE, parseBookingPageConfig, validateBookingPageConfig } from "@/lib/booking-page";
import { describe, expect, it } from "vitest";


describe("config validation (WEB-254)", () => {
  it("caps and normalizes every section; drops empties", () => {
    const cfg = validateBookingPageConfig({
      hero: { title: "  Book your shoot  ", subtitle: "S".repeat(301) },
      intro: { heading: "How it works", body: "Steps…" },
      faq: [
        { q: "Do you travel?", a: "Yes!" },
        { q: "", a: "" },
        { q: "Bad", a: "" },
      ],
      socials: [
        { kind: "instagram", url: "https://instagram.com/studio" },
        { kind: "website", url: "javascript:alert(1)" },
      ],
      thanks: { title: "See you soon!", body: "Thanks {{client_name}}." },
    });
    expect(cfg).toBeNull(); // malformed faq entry + non-https social reject wholesale
    const good = validateBookingPageConfig({
      hero: { title: "Book your shoot", subtitle: "Sunset sessions every Friday" },
      faq: [{ q: "Do you travel?", a: "Within 50 km at no charge." }],
      socials: [{ kind: "instagram", url: "https://instagram.com/studio" }, { kind: "email", url: "mailto:hi@studio.com" }],
      thanks: { title: "See you soon!", body: "Thanks!" },
    });
    expect(good).not.toBeNull();
    expect(good!.hero.title).toBe("Book your shoot");
    expect(good!.faq).toHaveLength(1);
    expect(good!.socials).toHaveLength(2);
    expect(parseBookingPageConfig(null)).toEqual(EMPTY_BOOKING_PAGE);
    expect(parseBookingPageConfig("{broken")).toEqual(EMPTY_BOOKING_PAGE);
  });
});
