/* PDF generation on Workers (WEB-137/158) — pdf-lib (pure JS, no native
 * deps). Standard fonts only; brand accent applied as a header bar. */
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { contractBodyToText } from "./contract-body";
import { snapBrandUrl } from "./snap-url";

export type PdfLine = { description: string; qty: number; amountMinor: number };

/** Standard-font safety: WinAnsi can't encode arbitrary unicode — translate
 * the common typographic characters and drop anything else exotic. */
const WIN_ANSI_MAP: Record<string, string> = {
  "—": "-", "–": "-", "‐": "-", "‑": "-",
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "…": "...", " ": " ", "•": "*", "×": "x", "−": "-",
};
function winAnsiSafe(input: string): string {
  return input
    .replace(/[‐-―‘-‟‡-‧‰-⁞−�]/g, (c) => WIN_ANSI_MAP[c] ?? "-")
    .replace(/[^ -~¡-ÿ]/g, "?");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(v, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** WEB-238: PDF footer line — white-labeled studios get `© {studio}`
 * instead of the platform mention. Exported for the zero-Snap audit test. */
export function pdfFooterLine(studioName: string, whiteLabel: boolean): string {
  return whiteLabel ? `© ${studioName}` : "Powered by Snap - snap.webcules.com";
}

/** Overlay a URI link annotation on a drawn footer line — pdf-lib has no
 * drawLink, so the clickable area is the text rect itself (the free-tier
 * growth loop: the footer "Powered by Snap" opens the homepage). */
function linkFooterText(
  doc: PDFDocument,
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  medium: string,
): void {
  const ref = doc.context.nextRef();
  doc.context.assign(
    ref,
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y - 1.5, x + font.widthOfTextAtSize(text, 8), y + 9],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(snapBrandUrl(medium)) },
    }),
  );
  page.node.addAnnot(ref);
}

/** WEB-241: draw the studio logo (PNG bytes, usually the 2/8 email-header
 * asset) into the accent header bar, height-fitted. Returns the x where the
 * studio-name text should start (right of the logo) — or the fallback x
 * unchanged when there is no logo. Transparent PNGs keep their alpha. */
async function drawHeaderLogo(
  doc: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  logoPng: Uint8Array | undefined,
  opts: { x: number; centerY: number; maxHeight: number },
): Promise<number> {
  if (!logoPng || logoPng.length === 0) return opts.x;
  try {
    const img = await doc.embedPng(logoPng);
    const h = Math.min(opts.maxHeight, 28);
    const w = (img.width / img.height) * h;
    // Skip absurdly wide logos that would eat the whole bar.
    if (w > 240) return opts.x;
    page.drawImage(img, { x: opts.x, y: opts.centerY - h / 2, width: w, height: h });
    return opts.x + w + 12;
  } catch (err) {
    console.error("logo embed failed (falling back to text header):", String(err));
    return opts.x;
  }
}

/** WEB-241: studio-owned document metadata — title/author are the studio's,
 * never the platform (pdf-lib's own defaults would leak "pdf-lib"). */
function setStudioMetadata(doc: PDFDocument, title: string, studioName: string): void {
  doc.setTitle(title);
  doc.setAuthor(studioName);
  doc.setCreator(studioName);
  doc.setProducer(studioName);
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100);
}

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderInvoicePdf(params: {
  studioName: string;
  accent: string;
  invoiceNumber: string;
  issuedAt: Date;
  dueAt: Date | null;
  clientEmail: string | null;
  projectTitle: string | null;
  lines: PdfLine[];
  totalMinor: number;
  currency: string;
  status: string;
  /** WEB-238: white-labeled studios get `© {studio}` instead of the platform footer. */
  whiteLabel?: boolean;
  /** WEB-241: studio logo PNG bytes (the 2/8 email-header asset) for the
   * accent header bar; absent → today's text-only header. */
  logoPng?: Uint8Array;
  /** WEB-252: tax snapshot (label + bps) + terms/memo text. */
  taxLabel?: string | null;
  taxRateBps?: number | null;
  terms?: string | null;
  memo?: string | null;
}): Promise<Uint8Array> {
  // Sanitize at the boundary — wrap()/widthOfTextAtSize also encode.
  params = {
    ...params,
    studioName: winAnsiSafe(params.studioName),
    clientEmail: params.clientEmail ? winAnsiSafe(params.clientEmail) : null,
    projectTitle: params.projectTitle ? winAnsiSafe(params.projectTitle) : null,
    lines: params.lines.map((l) => ({ ...l, description: winAnsiSafe(l.description) })),
  };
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(params.accent);
  const ink = rgb(0.06, 0.06, 0.07);
  const subtle = rgb(0.54, 0.56, 0.6);
  setStudioMetadata(doc, `${params.studioName} — Invoice ${params.invoiceNumber}`, params.studioName);

  // Header: accent bar + (logo →) studio name + INVOICE
  page.drawRectangle({ x: 0, y: 781.89, width: 595.28, height: 60, color: rgb(accent.r, accent.g, accent.b) });
  const nameX = await drawHeaderLogo(doc, page, params.logoPng, { x: 48, centerY: 811.89, maxHeight: 28 });
  page.drawText(winAnsiSafe(params.studioName), { x: nameX, y: 815, size: 20, font: bold, color: rgb(1, 1, 1) });
  const invoiceLabel = "INVOICE";
  page.drawText(invoiceLabel, { x: 595.28 - 48 - bold.widthOfTextAtSize(invoiceLabel, 22), y: 813, size: 22, font: bold, color: rgb(1, 1, 1) });

  let y = 745;
  const meta: [string, string][] = [
    ["Number", params.invoiceNumber],
    ["Issued", params.issuedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })],
    ["Due", params.dueAt ? params.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"],
    ["Status", params.status.toUpperCase()],
  ];
  for (const [k, v] of meta) {
    page.drawText(k.toUpperCase(), { x: 400, y, size: 8, font: bold, color: subtle });
    page.drawText(winAnsiSafe(v), { x: 400, y: y - 13, size: 11, font: regular, color: ink });
    y -= 34;
  }
  page.drawText("BILLED TO", { x: 48, y: 745, size: 8, font: bold, color: subtle });
  page.drawText(winAnsiSafe(params.clientEmail ?? "-"), { x: 48, y: 732, size: 11, font: regular, color: ink });
  if (params.projectTitle) {
    page.drawText("PROJECT", { x: 48, y: 710, size: 8, font: bold, color: subtle });
    wrap(params.projectTitle, regular, 11, 300).slice(0, 2).forEach((l, i) => {
      page.drawText(winAnsiSafe(l), { x: 48, y: 697 - i * 14, size: 11, font: regular, color: ink });
    });
  }

  // Lines table — sits below the 4-row meta column (last value ~y 630);
  // starting at 640 collided with the STATUS row and printed "DRAFT" over
  // the header bar.
  y = 596;
  page.drawRectangle({ x: 48, y: y - 6, width: 499.28, height: 24, color: rgb(0.95, 0.96, 0.96) });
  page.drawText("DESCRIPTION", { x: 56, y, size: 8, font: bold, color: subtle });
  page.drawText("QTY", { x: 386, y, size: 8, font: bold, color: subtle });
  page.drawText("AMOUNT", { x: 466, y, size: 8, font: bold, color: subtle });
  y -= 30;
  for (const line of params.lines) {
    const wrapped = wrap(line.description, regular, 11, 310).slice(0, 3);
    for (let i = 0; i < wrapped.length; i++) {
      page.drawText(winAnsiSafe(wrapped[i]), { x: 56, y: y - i * 14, size: 11, font: regular, color: ink });
    }
    page.drawText(String(line.qty), { x: 386, y, size: 11, font: regular, color: ink });
    const amt = money(line.qty > 0 ? line.amountMinor * line.qty : line.amountMinor, params.currency);
    page.drawText(amt, { x: 547.28 - regular.widthOfTextAtSize(amt, 11), y, size: 11, font: regular, color: ink });
    y -= 18 * wrapped.length + 8;
  }

  // WEB-252: tax row (snapshot) between the lines and the total.
  const subtotalMinor = params.lines.reduce((n, l) => n + (l.qty > 0 ? l.amountMinor * l.qty : l.amountMinor), 0);
  const taxMinor = params.taxRateBps ? Math.round((subtotalMinor * params.taxRateBps) / 10000) : 0;
  y -= 10;
  if (params.taxRateBps && params.taxLabel) {
    page.drawText(winAnsiSafe(params.taxLabel), { x: 330, y, size: 10, font: regular, color: ink });
    const tax = money(taxMinor, params.currency);
    page.drawText(tax, { x: 547.28 - regular.widthOfTextAtSize(tax, 10), y, size: 10, font: regular, color: ink });
    y -= 18;
    page.drawText("Subtotal", { x: 330, y, size: 10, font: regular, color: subtle });
    const sub = money(subtotalMinor, params.currency);
    page.drawText(sub, { x: 547.28 - regular.widthOfTextAtSize(sub, 10), y, size: 10, font: regular, color: subtle });
    y -= 6;
  }
  page.drawLine({ start: { x: 330, y }, end: { x: 547.28, y }, thickness: 1, color: rgb(0.88, 0.89, 0.9) });
  y -= 24;
  page.drawText("TOTAL DUE", { x: 400, y, size: 9, font: bold, color: subtle });
  const total = money(params.totalMinor, params.currency);
  page.drawText(total, { x: 547.28 - bold.widthOfTextAtSize(total, 14), y, size: 14, font: bold, color: rgb(accent.r, accent.g, accent.b) });

  // WEB-252: terms + memo (snapshot at creation; merge fields pre-rendered).
  y -= 34;
  if (params.memo) {
    for (const line of wrap(winAnsiSafe(params.memo), regular, 9, 499).slice(0, 4)) {
      page.drawText(line, { x: 48, y, size: 9, font: regular, color: ink });
      y -= 12;
    }
    y -= 4;
  }
  if (params.terms) {
    for (const line of wrap(winAnsiSafe(params.terms), regular, 8, 499).slice(0, 5)) {
      page.drawText(line, { x: 48, y, size: 8, font: regular, color: subtle });
      y -= 11;
    }
  }

  // Footer
  const footer = pdfFooterLine(params.studioName, params.whiteLabel === true);
  page.drawText(footer, { x: 48, y: 56, size: 8, font: regular, color: subtle });
  if (params.whiteLabel !== true) linkFooterText(doc, page, footer, 48, 56, regular, "invoice");
  page.drawText("Thank you for your business.", { x: 48, y: 68, size: 9, font: regular, color: subtle });

  return doc.save({ useObjectStreams: false });
}

/* ---------------- Contract PDF (WEB-158) ---------------- */

/** Multi-page contract: wrapped body text with page breaks, signature
 * block on the final page (typed name, timestamp, IP — the audit trail). */
export async function renderContractPdf(params: {
  studioName: string;
  accent: string;
  title: string;
  body: string;
  signerName: string | null;
  signedAt: Date | null;
  signerIp: string | null;
  clientEmail: string | null;
  /** WEB-238: white-labeled studios get `© {studio}` instead of the platform footer. */
  whiteLabel?: boolean;
  /** WEB-241: studio logo PNG bytes for the accent header bar. */
  logoPng?: Uint8Array;
}): Promise<Uint8Array> {
  const sanitize = (v: string) => winAnsiSafe(v);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(params.accent);
  setStudioMetadata(doc, `${params.studioName} — ${params.title}`, params.studioName);

  const MARGIN = 56;
  const WIDTH = 595.28;
  const BOTTOM = 72;
  let page = doc.addPage([WIDTH, 841.89]);
  let y = 841.89;

  const newPage = () => {
    page = doc.addPage([WIDTH, 841.89]);
    y = 841.89 - 40;
  };
  const ensure = (needed: number) => {
    if (y - needed < BOTTOM) newPage();
  };

  // Header
  page.drawRectangle({ x: 0, y: 781.89, width: WIDTH, height: 60, color: rgb(accent.r, accent.g, accent.b) });
  const nameX = await drawHeaderLogo(doc, page, params.logoPng, { x: MARGIN, centerY: 811.89, maxHeight: 26 });
  page.drawText(sanitize(params.studioName), { x: nameX, y: 815, size: 18, font: bold, color: rgb(1, 1, 1) });
  y = 741.89;
  page.drawText(sanitize(params.title), { x: MARGIN, y, size: 15, font: bold, color: rgb(0.06, 0.06, 0.07) });
  y -= 22;
  if (params.clientEmail) {
    page.drawText(`Prepared for: ${sanitize(params.clientEmail)}`, { x: MARGIN, y, size: 10, font: regular, color: rgb(0.54, 0.56, 0.6) });
    y -= 24;
  }

  // Body — paragraph-aware wrapping
  for (const para of sanitize(contractBodyToText(params.body)).split(/\n/)) {
    if (!para.trim()) {
      y -= 12;
      continue;
    }
    for (const line of wrap(para, regular, 11, WIDTH - MARGIN * 2)) {
      ensure(18);
      page.drawText(line, { x: MARGIN, y, size: 11, font: regular, color: rgb(0.13, 0.14, 0.15) });
      y -= 16;
    }
    y -= 6;
  }

  // Signature block
  y -= 18;
  ensure(120);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 220, y }, thickness: 1, color: rgb(0.6, 0.62, 0.65) });
  page.drawText(sanitize(params.signerName ?? "Unsigned"), { x: MARGIN, y: y + 8, size: 13, font: bold, color: rgb(0.06, 0.06, 0.07) });
  y -= 16;
  const signed = params.signedAt
    ? `Signed electronically on ${params.signedAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })} UTC${params.signerIp ? ` · IP ${params.signerIp}` : ""}`
    : "Awaiting signature";
  page.drawText(signed, { x: MARGIN, y, size: 9, font: regular, color: rgb(0.54, 0.56, 0.6) });
  y -= 14;
  const cFooter = pdfFooterLine(sanitize(params.studioName), params.whiteLabel === true);
  page.drawText(cFooter, { x: MARGIN, y, size: 8, font: regular, color: rgb(0.54, 0.56, 0.6) });
  if (params.whiteLabel !== true) linkFooterText(doc, page, cFooter, MARGIN, y, regular, "contract");

  return doc.save({ useObjectStreams: false });
}
