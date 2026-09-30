import io

def edit(path, pairs):
    s = io.open(path, encoding="utf-8").read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: not unique ({s.count(old)}): {old[:70]!r}"
        s = s.replace(old, new)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print("ok", path)

# ---------- 1. schema: business column ----------
edit("lib/db-schema.ts", [(
    """  /** WEB-275: "members see RAW vault" per-org toggle (admins always can). */
  memberRawAccess: integer("member_raw_access", { mode: "boolean" }).notNull().default(false),""",
    """  /** WEB-275: "members see RAW vault" per-org toggle (admins always can). */
  memberRawAccess: integer("member_raw_access", { mode: "boolean" }).notNull().default(false),
  /** WEB-277: business identity JSON — legalName, addressLines, taxId, phone,
   * website (see lib/business.ts; null = never set → PDFs unchanged). */
  business: text("business"),""",
)])

# ---------- 2. merge-field registry ----------
edit("lib/merge-fields.ts", [(
    """  { id: "studio_legal_name", label: "Studio legal name", description: "Your studio's name for agreement language" },""",
    """  { id: "studio_legal_name", label: "Studio legal name", description: "Your legal business name (Settings → General)" },
  { id: "studio_address", label: "Studio address", description: "Your business address (one line)" },
  { id: "studio_tax_id", label: "Studio tax ID", description: "Your tax registration (e.g. GST reg. no. …)" },
  { id: "studio_phone", label: "Studio phone", description: "Your business phone" },
  { id: "studio_website", label: "Studio website", description: "Your website", link: true },""",
)])

# ---------- 3. merge resolver ----------
edit("lib/merge.ts", [(
    """  values.studio_legal_name = profile?.studioName ?? "the Studio";""",
    """  // WEB-277: business identity (falls back to the studio name gracefully).
  const business = parseBusiness(profile?.business ?? null, profile?.studioName ?? "the Studio");
  values.studio_legal_name = business.legalName || (profile?.studioName ?? "the Studio");
  values.studio_address = businessAddressLine(business);
  values.studio_tax_id = taxIdLine(business);
  values.studio_phone = business.phone;
  values.studio_website = business.website;""",
), (
    'import { getStudioProfile } from "./repos/studios";' if io.open("lib/merge.ts", encoding="utf-8").read().count('import { getStudioProfile } from "./repos/studios";') else 'x',
    'import { getStudioProfile } from "./repos/studios";\nimport { businessAddressLine, parseBusiness, taxIdLine } from "./business";',
)])

# ---------- 4. invoice PDF: FROM block + tax small print ----------
edit("lib/pdf.ts", [(
    """export async function renderInvoicePdf(params: {""",
    """/** WEB-277: the invoice/contract "From" identity (absent = today's layout). */
export type PdfBusiness = {
  legalName: string;
  addressLines: string[];
  /** Small print, e.g. "GST reg. no. 12345" (already label-formatted). */
  taxLine: string;
};

export async function renderInvoicePdf(params: {""",
), (
    """    taxLabel: invoiceTaxLabel,
    taxRateBps:""" if False else """    /** WEB-277: business identity for the FROM block + tax small print. */
    from?: PdfBusiness;
    lines:""",
    """    /** WEB-277: business identity for the FROM block + tax small print. */
    from?: PdfBusiness;
    lines:""",
), (
    """  if (params.projectTitle) {
    page.drawText("PROJECT", { x: 48, y: 710, size: 8, font: bold, color: subtle });
    wrap(params.projectTitle, regular, 11, 300).slice(0, 2).forEach((l, i) => {
      page.drawText(winAnsiSafe(l), { x: 48, y: 697 - i * 14, size: 11, font: regular, color: ink });
    });
  }""",
    """  if (params.projectTitle) {
    page.drawText("PROJECT", { x: 48, y: 710, size: 8, font: bold, color: subtle });
    wrap(params.projectTitle, regular, 11, 300).slice(0, 2).forEach((l, i) => {
      page.drawText(winAnsiSafe(l), { x: 48, y: 697 - i * 14, size: 11, font: regular, color: ink });
    });
  }
  // WEB-277: FROM block under BILLED TO — legal name, address, tax id.
  if (params.from) {
    let fy = 672;
    page.drawText("FROM", { x: 48, y: fy, size: 8, font: bold, color: subtle });
    fy -= 13;
    const fromLines = [params.from.legalName, ...params.from.addressLines].filter(Boolean).slice(0, 4);
    for (const l of fromLines) {
      page.drawText(winAnsiSafe(l), { x: 48, y: fy, size: 10, font: regular, color: ink });
      fy -= 12;
    }
    if (params.from.taxLine) {
      page.drawText(winAnsiSafe(params.from.taxLine), { x: 48, y: fy, size: 8, font: regular, color: subtle });
    }
  }""",
), (
    """    const sub = money(subtotalMinor, params.currency);
    page.drawText(sub, { x: 547.28 - regular.widthOfTextAtSize(sub, 10), y, size: 10, font: regular, color: subtle });
    y -= 6;
  }""",
    """    const sub = money(subtotalMinor, params.currency);
    page.drawText(sub, { x: 547.28 - regular.widthOfTextAtSize(sub, 10), y, size: 10, font: regular, color: subtle });
    y -= 6;
    // WEB-277: compliance detail — tax registration next to the tax lines.
    if (params.from?.taxLine) {
      page.drawText(winAnsiSafe(params.from.taxLine), { x: 330, y: y - 8, size: 8, font: regular, color: subtle });
    }
  }""",
)])

# ---------- 5. contract PDF: legal lines in the title block ----------
edit("lib/pdf.ts", [(
    """  if (params.clientEmail) {
    page.drawText(`Prepared for: ${sanitize(params.clientEmail)}`, { x: MARGIN, y, size: 10, font: regular, color: rgb(0.54, 0.56, 0.6) });
    y -= 24;
  }""",
    """  if (params.clientEmail) {
    page.drawText(`Prepared for: ${sanitize(params.clientEmail)}`, { x: MARGIN, y, size: 10, font: regular, color: rgb(0.54, 0.56, 0.6) });
    y -= 24;
  }
  // WEB-277: optional legal identity under the title (legal weight).
  if (params.from) {
    for (const l of [params.from.legalName !== params.studioName ? params.from.legalName : null, ...params.from.addressLines]
      .filter(Boolean)
      .slice(0, 4)) {
      page.drawText(sanitize(l), { x: MARGIN, y, size: 9, font: regular, color: rgb(0.54, 0.56, 0.6) });
      y -= 12;
    }
    if (params.from.taxLine) {
      page.drawText(sanitize(params.from.taxLine), { x: MARGIN, y, size: 9, font: regular, color: rgb(0.54, 0.56, 0.6) });
      y -= 12;
    }
    y -= 8;
  }""",
), (
    """  /** WEB-241: studio logo PNG bytes for the accent header bar. */
  logoPng?: Uint8Array;
}): Promise<Uint8Array> {
  const sanitize = (v: string) => winAnsiSafe(v);""",
    """  /** WEB-241: studio logo PNG bytes for the accent header bar. */
  logoPng?: Uint8Array;
  /** WEB-277: business identity for the title block. */
  from?: PdfBusiness;
}): Promise<Uint8Array> {
  const sanitize = (v: string) => winAnsiSafe(v);""",
)])

print("pdf + merge + schema done")
