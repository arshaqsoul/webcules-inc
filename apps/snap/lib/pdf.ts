/* PDF generation on Workers (WEB-137/158) — pdf-lib (pure JS, no native
 * deps). Standard fonts only; brand accent applied as a header bar. */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

  // Header: accent bar + studio name + INVOICE
  page.drawRectangle({ x: 0, y: 781.89, width: 595.28, height: 60, color: rgb(accent.r, accent.g, accent.b) });
  page.drawText(winAnsiSafe(params.studioName), { x: 48, y: 815, size: 20, font: bold, color: rgb(1, 1, 1) });
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

  // Lines table
  y = 640;
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

  // Total
  y -= 10;
  page.drawLine({ start: { x: 330, y }, end: { x: 547.28, y }, thickness: 1, color: rgb(0.88, 0.89, 0.9) });
  y -= 24;
  page.drawText("TOTAL DUE", { x: 400, y, size: 9, font: bold, color: subtle });
  const total = money(params.totalMinor, params.currency);
  page.drawText(total, { x: 547.28 - bold.widthOfTextAtSize(total, 14), y, size: 14, font: bold, color: rgb(accent.r, accent.g, accent.b) });

  // Footer
  page.drawText("Powered by Snap - snap.webcules.com", { x: 48, y: 56, size: 8, font: regular, color: subtle });
  page.drawText("Thank you for your business.", { x: 48, y: 68, size: 9, font: regular, color: subtle });

  return doc.save();
}
