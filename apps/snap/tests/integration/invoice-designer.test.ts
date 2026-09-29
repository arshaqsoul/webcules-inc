/* WEB-252 invoice designer — settings validation, numbering formats
 * (incl. reset-yearly), tax math in minor units, creation-time snapshots
 * (old invoices unchanged), preset parsing and the seed library. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { DEFAULT_INVOICE_SETTINGS, parseInvoiceSettings, parsePresetLines, taxFor } from "@/lib/invoice-settings";
import { starterTemplateRows } from "@/lib/repos/templates";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function setSettings(orgId: string, patch: Record<string, unknown>) {
  const settings = { ...DEFAULT_INVOICE_SETTINGS, ...patch };
  await getDb().update(schema.studioProfiles).set({ invoiceSettings: JSON.stringify(settings) }).where(eq(schema.studioProfiles.organizationId, orgId));
}

describe("settings (WEB-252)", () => {
  it("validates and clamps every field", () => {
    const s = parseInvoiceSettings(
      JSON.stringify({
        numberPrefix: "IN VO!-",
        numberPadding: 99,
        resetYearly: true,
        taxLabel: "  Sales tax 8.25% ",
        taxRateBps: 99999,
        dueDays: -5,
        termsText: "t".repeat(600),
      }),
    );
    expect(s.numberPrefix).toBe("INVO-");
    expect(s.numberPadding).toBe(6);
    expect(s.taxLabel).toBe("Sales tax 8.25%");
    expect(s.taxRateBps).toBe(20000);
    expect(s.dueDays).toBe(0);
    expect(s.termsText.length).toBe(500);
    expect(parseInvoiceSettings("{broken")).toEqual(DEFAULT_INVOICE_SETTINGS);
    expect(parseInvoiceSettings(null)).toEqual(DEFAULT_INVOICE_SETTINGS);
  });

  it("tax math is exact in minor units (rounding, qty-aware)", () => {
    expect(taxFor(10000, 825)).toBe(825); // 8.25% of $100.00
    expect(taxFor(999, 825)).toBe(82); // rounds 82.4175
    expect(taxFor(10000, 0)).toBe(0);
    // qty 3 × $33.33 = 9999 → 8.25% = 824.9175 → 825
    expect(taxFor(9999, 825)).toBe(825);
  });
});

describe("numbering + snapshots (WEB-252)", () => {
  it("formats numbers with prefix/padding and resets yearly", async () => {
    const studio = await seedStudio();
    await setSettings(studio.organizationId, { numberPrefix: "BL-", numberPadding: 3, resetYearly: true });
    const projectId = await seedProject(studio.organizationId);
    const a = await createInvoice({ organizationId: studio.organizationId, projectId, lines: [{ description: "x", qty: 1, amountMinor: 1000 }] });
    const b = await createInvoice({ organizationId: studio.organizationId, projectId, lines: [{ description: "x", qty: 1, amountMinor: 1000 }] });
    const year = new Date().getUTCFullYear();
    expect(a.number).toBe(`BL-${year}-001`);
    expect(b.number).toBe(`BL-${year}-002`);
    // The counter remembers the year; crossing into a new year restarts the
    // sequence (fresh prefix so the unique index isn't collided by the test).
    const db = getDb();
    await db.update(schema.orgCounters).set({ invoiceYear: String(year - 1) }).where(eq(schema.orgCounters.organizationId, studio.organizationId));
    await setSettings(studio.organizationId, { numberPrefix: "NX-", numberPadding: 3, resetYearly: true });
    const c = await createInvoice({ organizationId: studio.organizationId, projectId, lines: [{ description: "x", qty: 1, amountMinor: 1000 }] });
    expect(c.number).toBe(`NX-${year}-001`);
  });

  it("new invoices snapshot tax/terms/due; old invoices unchanged", async () => {
    const studio = await seedStudio();
    const projectId = await seedProject(studio.organizationId);
    const old = await createInvoice({ organizationId: studio.organizationId, projectId, lines: [{ description: "old", qty: 1, amountMinor: 10000 }] });
    expect(old.totalMinor).toBe(10000); // no settings → no tax
    expect(old.taxLabel).toBeNull();

    await setSettings(studio.organizationId, { taxLabel: "Sales tax 8.25%", taxRateBps: 825, dueDays: 14, termsText: "Net 14.", memo: "Travel included." });
    const fresh = await createInvoice({ organizationId: studio.organizationId, projectId, lines: [{ description: "new", qty: 2, amountMinor: 5000 }] });
    expect(fresh.totalMinor).toBe(10000 + 825);
    expect(fresh.taxLabel).toBe("Sales tax 8.25%");
    expect(fresh.taxRateBps).toBe(825);
    expect(fresh.terms).toBe("Net 14.");
    expect(fresh.memo).toBe("Travel included.");
    expect(fresh.dueAt?.getTime()).toBeGreaterThan(Date.now() + 13 * 864e5);

    // The OLD row never changed.
    const oldRow = (await getDb().select().from(schema.invoices).where(eq(schema.invoices.id, old.id)))[0];
    expect(oldRow.totalMinor).toBe(10000);
    expect(oldRow.taxLabel).toBeNull();
  });
});

describe("presets (WEB-252)", () => {
  it("parses preset lines defensively", () => {
    const lines = parsePresetLines(
      JSON.stringify([
        { description: "Coverage", qty: 1, amountMinor: 240000 },
        { description: "", qty: 1, amountMinor: 500 },
        { description: "Album", qty: 2, amountMinor: 30000 },
        "junk",
        { description: "Zero", qty: 1, amountMinor: 0 },
      ]),
    );
    expect(lines).toEqual([
      { description: "Coverage", qty: 1, amountMinor: 240000 },
      { description: "Album", qty: 2, amountMinor: 30000 },
    ]);
    expect(parsePresetLines("[]")).toEqual([]);
    expect(parsePresetLines("{broken")).toEqual([]);
  });

  it("seeds the package presets", () => {
    const rows = starterTemplateRows("org").filter((r) => r.kind === "invoice_preset");
    expect(rows.map((r) => r.name)).toEqual(["Standard terms", "Wedding Collection", "Portrait Session", "Mini Session"]);
    for (const r of rows.slice(1)) {
      expect(parsePresetLines(r.body as string).length).toBeGreaterThan(0);
    }
  });

  it("applies preset lines onto an invoice verbatim", async () => {
    const studio = await seedStudio({ plan: "lite" });
    const projectId = await seedProject(studio.organizationId);
    const lines = parsePresetLines(JSON.stringify([{ description: "Full-day wedding coverage (8 hours)", qty: 1, amountMinor: 240000 }, { description: "Second photographer", qty: 1, amountMinor: 45000 }]));
    const inv = await createInvoice({ organizationId: studio.organizationId, projectId, lines });
    expect(inv.totalMinor).toBe(285000);
    expect(JSON.parse(inv.lines)).toEqual(lines);
  });
});
