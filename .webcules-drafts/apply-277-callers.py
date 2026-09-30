import io

def edit(path, pairs):
    s = io.open(path, encoding="utf-8").read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: not unique ({s.count(old)}): {old[:70]!r}"
        s = s.replace(old, new)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print("ok", path)

# ---------- contracts.ts: studioAccent carries the identity ----------
edit("lib/contracts.ts", [(
    """async function studioAccent(organizationId: string): Promise<StudioBrand> {
  const b = await getEmailBrand(organizationId);
  const logoPng = await fetchEmailHeaderLogo(organizationId, (await getStudioProfile(organizationId))?.brandAssets);
  return {
    name: b.studioName,
    accent: b.accent,
    contactEmail: b.contactEmail,
    whiteLabel: b.whiteLabel,
    emailHeaderUrl: b.emailHeaderUrl,
    logoPng,
  };
}""",
    """async function studioAccent(organizationId: string): Promise<StudioBrand> {
  const b = await getEmailBrand(organizationId);
  const profile = await getStudioProfile(organizationId);
  const logoPng = await fetchEmailHeaderLogo(organizationId, profile?.brandAssets);
  return {
    name: b.studioName,
    accent: b.accent,
    contactEmail: b.contactEmail,
    whiteLabel: b.whiteLabel,
    emailHeaderUrl: b.emailHeaderUrl,
    logoPng,
    // WEB-277: business identity for the contract title block.
    from: pdfBusinessFrom(profile?.business ?? null, b.studioName),
  };
}""",
), (
    "import { renderContractPdf } from \"./pdf\";",
    "import { renderContractPdf, type PdfBusiness } from \"./pdf\";\nimport { businessAddressLine, hasBusinessIdentity, parseBusiness, taxIdLine } from \"./business\";",
), (
    "contactEmail: string | null;",
    "contactEmail: string | null;\n  from?: PdfBusiness;",
)])

# helper at module level (after imports of contracts.ts — anchor on studioAccent's doc/first fn)
edit("lib/contracts.ts", [(
    "async function studioAccent(organizationId: string): Promise<StudioBrand> {",
    """/** WEB-277: build the PDF identity block from the stored business bag. */
function pdfBusinessFrom(businessJson: string | null, studioName: string): PdfBusiness | undefined {
  const b = parseBusiness(businessJson, studioName);
  if (!hasBusinessIdentity(b)) return undefined;
  return { legalName: b.legalName, addressLines: b.addressLines.filter(Boolean), taxLine: taxIdLine(b) };
}

async function studioAccent(organizationId: string): Promise<StudioBrand> {""",
)])

# both renderContractPdf call sites pass from
s = io.open("lib/contracts.ts", encoding="utf-8").read()
assert s.count("logoPng: studio.logoPng ?? undefined,") >= 1
s = s.replace("logoPng: studio.logoPng ?? undefined,", "logoPng: studio.logoPng ?? undefined,\n    from: studio.from,")
io.open("lib/contracts.ts", "w", encoding="utf-8", newline="").write(s)
print("contracts call sites ok")

# ---------- invoices.ts: FROM block on the archived PDF ----------
edit("lib/invoices.ts", [(
    """async function generateAndArchivePdf(invoice: InvoiceRow, projectTitle: string | null): Promise<string> {
  const profile = await getStudioProfile(invoice.organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const pdf = await renderInvoicePdf({
    studioName: profile?.studioName ?? "Studio",""",
    """async function generateAndArchivePdf(invoice: InvoiceRow, projectTitle: string | null): Promise<string> {
  const profile = await getStudioProfile(invoice.organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const biz = parseBusiness(profile?.business ?? null, profile?.studioName ?? "Studio");
  const pdf = await renderInvoicePdf({
    studioName: profile?.studioName ?? "Studio",
    // WEB-277: legal name/address/tax id on the invoice when configured.
    ...(hasBusinessIdentity(biz)
      ? { from: { legalName: biz.legalName, addressLines: biz.addressLines.filter(Boolean), taxLine: taxIdLine(biz) } }
      : {}),""",
), (
    'import { renderInvoicePdf } from "./pdf";',
    'import { renderInvoicePdf } from "./pdf";\nimport { businessAddressLine as _ba, hasBusinessIdentity, parseBusiness, taxIdLine } from "./business";\nvoid _ba;',
)])

# ---------- templates preview route ----------
edit("app/api/studio/templates/[id]/preview/route.ts", [(
    "const pdf = await renderInvoicePdf({",
    "const pdf = await renderInvoicePdf({",
)])

print("callers done")
