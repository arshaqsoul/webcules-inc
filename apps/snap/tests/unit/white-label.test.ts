/* WEB-238 white-label unit tests: the isWhiteLabeled truth table, client
 * email templates (zero Snap mentions when on, original copy when off) and
 * the PDF footer flip. Links passed into templates use example.com so the
 * assertions test template copy only — real link hosts are the documented
 * honest limit, not a branding mention. */
import { describe, expect, it } from "vitest";

import { isWhiteLabeled } from "@/lib/branding";
import {
  bookingCanceledEmail,
  bookingConfirmedClientEmail,
  bookingConfirmedEmails,
  contractSignRequestEmail,
  contractSignedEmail,
  galleryLinkEmail,
  galleryOtpEmail,
  inquiryAckEmail,
  invoiceEmail,
  portalCodeEmail,
  projectCompleteClientEmail,
  refundClientEmail,
} from "@/lib/email";
import { renderContractPdf, renderInvoicePdf, pdfFooterLine } from "@/lib/pdf";

const ENT_ON = { whiteLabel: true };
const ENT_OFF = { whiteLabel: false };

describe("isWhiteLabeled (WEB-238)", () => {
  it("requires both the entitlement and the toggle", () => {
    expect(isWhiteLabeled(ENT_ON, { removeBranding: true })).toBe(true);
    expect(isWhiteLabeled(ENT_ON, { removeBranding: false })).toBe(false);
    expect(isWhiteLabeled(ENT_OFF, { removeBranding: true })).toBe(false);
    expect(isWhiteLabeled(null, { removeBranding: true })).toBe(false);
    expect(isWhiteLabeled(undefined, { removeBranding: true })).toBe(false);
  });

  it("parses raw brand JSON strings and rejects junk", () => {
    expect(isWhiteLabeled(ENT_ON, JSON.stringify({ removeBranding: true }))).toBe(true);
    expect(isWhiteLabeled(ENT_ON, '{"removeBranding":false}')).toBe(false);
    expect(isWhiteLabeled(ENT_ON, "{}")).toBe(false);
    expect(isWhiteLabeled(ENT_ON, "not json")).toBe(false);
    expect(isWhiteLabeled(ENT_ON, null)).toBe(false);
    expect(isWhiteLabeled(ENT_ON, undefined)).toBe(false);
  });

  it("only an explicit boolean true counts", () => {
    expect(isWhiteLabeled(ENT_ON, { removeBranding: "true" })).toBe(false);
    expect(isWhiteLabeled(ENT_ON, { removeBranding: 1 })).toBe(false);
  });
});

type ClientTemplate = { name: string; make: (wl: boolean) => { subject: string; html: string; text: string } };

const when = (d: Date) => d;
const TEMPLATES: ClientTemplate[] = [
  {
    name: "inquiryAckEmail",
    make: (wl) => inquiryAckEmail("Willow & Pine", "Ada", "#5e6ad2", wl),
  },
  {
    name: "bookingConfirmedEmails.client",
    make: (wl) =>
      bookingConfirmedEmails("Willow & Pine", {
        clientName: "Ada",
        startAt: when(new Date("2026-10-01T10:00:00Z")),
        endAt: when(new Date("2026-10-01T11:00:00Z")),
        tz: "UTC",
        icsUrl: "https://example.com/cal.ics",
        accent: "#5e6ad2",
        whiteLabel: wl,
      }).client,
  },
  {
    name: "bookingCanceledEmail",
    make: (wl) =>
      bookingCanceledEmail("Willow & Pine", {
        clientName: "Ada",
        startAt: new Date("2026-10-01T10:00:00Z"),
        tz: "UTC",
        accent: "#5e6ad2",
        whiteLabel: wl,
      }),
  },
  {
    name: "refundClientEmail",
    make: (wl) =>
      refundClientEmail("Willow & Pine", {
        clientName: "Ada",
        startAt: new Date("2026-10-01T10:00:00Z"),
        tz: "UTC",
        accent: "#5e6ad2",
        amountLabel: "$100.00",
        projectTitle: "Autumn shoot",
        contentDeleted: false,
        whiteLabel: wl,
      }),
  },
  {
    name: "bookingConfirmedClientEmail",
    make: (wl) =>
      bookingConfirmedClientEmail("Willow & Pine", {
        accent: "#5e6ad2",
        when: new Date("2026-10-01T10:00:00Z"),
        portalUrl: "https://example.com/portal",
        whiteLabel: wl,
      }),
  },
  {
    name: "projectCompleteClientEmail",
    make: (wl) =>
      projectCompleteClientEmail("Willow & Pine", {
        accent: "#5e6ad2",
        projectTitle: "Autumn shoot",
        portalUrl: "https://example.com/portal",
        whiteLabel: wl,
      }),
  },
  {
    name: "invoiceEmail",
    make: (wl) =>
      invoiceEmail("Willow & Pine", {
        accent: "#5e6ad2",
        invoiceNumber: "INV-001",
        amountLabel: "$100.00",
        dueLabel: "October 15, 2026",
        invoiceUrl: "https://example.com/inv/x",
        whiteLabel: wl,
      }),
  },
  {
    name: "contractSignRequestEmail",
    make: (wl) =>
      contractSignRequestEmail("Willow & Pine", {
        accent: "#5e6ad2",
        title: "Portrait agreement",
        signUrl: "https://example.com/c/x",
        whiteLabel: wl,
      }),
  },
  {
    name: "contractSignedEmail",
    make: (wl) =>
      contractSignedEmail("Willow & Pine", {
        accent: "#5e6ad2",
        title: "Portrait agreement",
        signerName: "Ada",
        signedAt: new Date("2026-10-01T10:00:00Z"),
        contractUrl: "https://example.com/c/x",
        whiteLabel: wl,
      }),
  },
  {
    name: "galleryOtpEmail",
    make: (wl) =>
      galleryOtpEmail("Willow & Pine", {
        code: "123456",
        galleryUrl: "https://example.com/g/x",
        accent: "#5e6ad2",
        whiteLabel: wl,
      }),
  },
  {
    name: "galleryLinkEmail",
    make: (wl) =>
      galleryLinkEmail("Willow & Pine", {
        clientName: "Ada",
        galleryUrl: "https://example.com/g/x",
        photoCount: 42,
        expiresAt: new Date("2026-11-01T00:00:00Z"),
        accent: "#5e6ad2",
        fresh: true,
        whiteLabel: wl,
      }),
  },
];

describe("client email templates (WEB-238)", () => {
  for (const t of TEMPLATES) {
    it(`${t.name}: white-labeled → zero Snap mentions, studio wordmark header`, () => {
      const out = t.make(true);
      expect(out.html).not.toContain("Snap");
      expect(out.html).not.toContain("snap.webcules.com");
      expect(out.html).toContain("Willow & Pine"); // wordmark = studio name
      expect(out.text).not.toContain("Snap");
    });

    it(`${t.name}: toggle off → keeps the branded copy`, () => {
      const out = t.make(false);
      expect(out.html).toContain("Snap");
      // The studio half of bookingConfirmedEmails is internal and asserted
      // separately; every client template keeps its Snap-bearing footer.
      expect(out.html).toMatch(/via Snap\.|Snap portal\.|Snap studios|via Snap,|Snap contracts|via Snap —|sent via Snap\./);
    });
  }

  it("bookingConfirmedEmails.studio stays platform-branded even when white-labeled (internal split)", () => {
    const { studio } = bookingConfirmedEmails("Willow & Pine", {
      clientName: "Ada",
      startAt: new Date("2026-10-01T10:00:00Z"),
      endAt: new Date("2026-10-01T11:00:00Z"),
      tz: "UTC",
      icsUrl: "https://example.com/cal.ics",
      accent: "#5e6ad2",
      whiteLabel: true,
    });
    expect(studio.html).toContain("Snap"); // header wordmark stays — internal email
  });
});

describe("branded email shell (WEB-240)", () => {
  const HDR = "https://snap.webcules.com/api/brand/org1/email-header.png?rev=r1";

  it("white-label + logo header asset → <img> header with studio alt", () => {
    const out = galleryLinkEmail("Willow & Pine", {
      clientName: "Ada",
      galleryUrl: "https://example.com/g/x",
      photoCount: 5,
      expiresAt: null,
      accent: "#5e6ad2",
      whiteLabel: true,
      emailHeaderUrl: HDR,
    });
    expect(out.html).toContain(`<img src="${HDR}" alt="Willow & Pine" height="40"`);
    expect(out.html).not.toContain(">Snap<");
  });

  it("white-label without the asset → studio-name wordmark fallback in accent", () => {
    const out = inquiryAckEmail("Willow & Pine", "Ada", "#123456", true);
    expect(out.html).not.toContain("<img");
    expect(out.html).toContain('color:#123456;">Willow & Pine</span>');
    expect(out.html).not.toContain(">Snap<");
  });

  it("white-label + contact email → footer carries the studio mailto", () => {
    const out = invoiceEmail("Willow & Pine", {
      accent: "#5e6ad2",
      invoiceNumber: "INV-9",
      amountLabel: "$1.00",
      dueLabel: null,
      invoiceUrl: "https://example.com/i/x",
      whiteLabel: true,
      contactEmail: "hi@willow.test",
    });
    expect(out.html).toContain('href="mailto:hi@willow.test"');
    expect(out.html).not.toContain("Snap");
  });

  it("branded mode → wordmark header, no img, no mailto injection (byte-shape unchanged)", () => {
    const out = invoiceEmail("Willow & Pine", {
      accent: "#5e6ad2",
      invoiceNumber: "INV-9",
      amountLabel: "$1.00",
      dueLabel: null,
      invoiceUrl: "https://example.com/i/x",
      whiteLabel: false,
      emailHeaderUrl: HDR, // ignored when not white-labeled
      contactEmail: "hi@willow.test",
    });
    expect(out.html).not.toContain("<img");
    expect(out.html).toContain(">Snap<");
    expect(out.html).not.toContain("mailto:hi@willow.test");
  });

  it("portalCodeEmail: neutral (zero Snap) when all studios white-labeled, branded otherwise", () => {
    const neutral = portalCodeEmail("123456", true);
    expect(neutral.subject).not.toContain("Snap");
    expect(neutral.html).not.toContain("Snap");
    expect(neutral.text).not.toContain("Snap");
    const branded = portalCodeEmail("123456", false);
    expect(branded.subject).toContain("Snap");
    expect(branded.html).toContain("Snap");
  });
});

describe("PDF footers (WEB-238)", () => {
  it("footer line flips with the flag (content streams are Flate-compressed, so the choice is unit-tested at the source)", () => {
    expect(pdfFooterLine("Willow & Pine", true)).toBe("© Willow & Pine");
    expect(pdfFooterLine("Willow & Pine", false)).toBe("Powered by Snap - snap.webcules.com");
  });

  it("renders both variants without throwing", async () => {
    const base = {
      studioName: "Willow & Pine",
      accent: "#5e6ad2",
      invoiceNumber: "INV-001",
      issuedAt: new Date("2026-10-01T10:00:00Z"),
      dueAt: null,
      clientEmail: "client@example.com",
      projectTitle: "Autumn shoot",
      lines: [{ description: "Session", qty: 1, amountMinor: 10000 }],
      totalMinor: 10000,
      currency: "usd",
      status: "sent",
    };
    const a = await renderInvoicePdf({ ...base, whiteLabel: true });
    const b = await renderInvoicePdf(base);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0); // footer differs → bytes differ
  });
});
