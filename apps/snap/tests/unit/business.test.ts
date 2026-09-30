/* WEB-277 business identity — parse/serialize degrade gracefully, absent
 * fields never change today's output, tax-id small print is label-aware. */
import { describe, expect, it } from "vitest";

import {
  businessAddressLine,
  hasBusinessIdentity,
  parseBusiness,
  serializeBusiness,
  taxIdLine,
} from "@/lib/business";

describe("parseBusiness", () => {
  it("null/corrupt bags degrade to the studio-name default", () => {
    expect(parseBusiness(null, "Willow and Pine").legalName).toBe("Willow and Pine");
    expect(parseBusiness("{oops", "Willow and Pine").addressLines).toEqual(["", "", ""]);
    expect(parseBusiness("{oops", "Willow and Pine").taxId).toBeNull();
  });

  it("round-trips a full identity through serialize", () => {
    const b = parseBusiness(
      JSON.stringify({
        legalName: "Willow and Pine Photo LLC",
        addressLines: ["12 Elm St", "Springfield, OR", "USA"],
        taxId: { label: "EIN", value: "88-1234567" },
        phone: "+1 555 0100",
        website: "willowandpine.com",
      }),
      "Willow and Pine",
    );
    const json = serializeBusiness(b, "Willow and Pine");
    expect(json).toBeTruthy();
    expect(parseBusiness(json, "Willow and Pine")).toEqual(b);
  });
});

describe("hasBusinessIdentity", () => {
  it("a bare legal name equal to the studio name is NOT identity", () => {
    expect(hasBusinessIdentity(parseBusiness(null, "Studio"))).toBe(false);
    expect(
      hasBusinessIdentity(parseBusiness(JSON.stringify({ legalName: "Other LLC" }), "Studio")),
    ).toBe(false); // legal name alone doesn't change the PDFs (name already prints)
    expect(
      hasBusinessIdentity(parseBusiness(JSON.stringify({ addressLines: ["12 Elm St"] }), "Studio")),
    ).toBe(true);
    expect(hasBusinessIdentity(parseBusiness(JSON.stringify({ taxId: { label: "GST", value: "123" } }), "Studio"))).toBe(true);
  });
});

describe("taxIdLine", () => {
  it("is label-aware (GST/VAT registration phrasing, EIN plain)", () => {
    const withTax = (label: string) => parseBusiness(JSON.stringify({ taxId: { label, value: "ABC-1" } }), "S");
    expect(taxIdLine(withTax("GST"))).toBe("GST reg. no. ABC-1");
    expect(taxIdLine(withTax("VAT"))).toBe("VAT reg. no. ABC-1");
    expect(taxIdLine(withTax("EIN"))).toBe("EIN ABC-1");
    expect(taxIdLine(withTax("Business No."))).toBe("Business No.: ABC-1");
    expect(taxIdLine(parseBusiness(null, "S"))).toBe("");
  });
});

describe("serializeBusiness", () => {
  it("nulls out when nothing meaningful is set (PDFs stay byte-identical)", () => {
    expect(serializeBusiness(parseBusiness(null, "Studio"), "Studio")).toBeNull();
    expect(serializeBusiness(parseBusiness(JSON.stringify({ phone: " " }), "Studio"), "Studio")).toBeNull();
  });
  it("address joins cleanly for merge fields", () => {
    expect(businessAddressLine(parseBusiness(JSON.stringify({ addressLines: ["12 Elm", "", "USA"] }), "S"))).toBe("12 Elm, USA");
  });
});
