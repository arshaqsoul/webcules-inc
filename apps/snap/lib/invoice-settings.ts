/* Invoice settings (WEB-252) — the studio's money voice: numbering format,
 * default tax, terms and memo. Snapshotted onto each invoice at creation so
 * old documents never change. All arithmetic in minor units / basis points. */
export type InvoiceSettings = {
  /** e.g. "INV-" or "BL-2026-" (≤ 12 chars). */
  numberPrefix: string;
  /** Sequence padding, 3–6. */
  numberPadding: number;
  /** Reset the sequence each calendar year (per-year counter). */
  resetYearly: boolean;
  /** Tax label shown on invoices ("GST 5%"). Empty = no default tax. */
  taxLabel: string;
  /** Basis points (500 = 5%). 0 = none. */
  taxRateBps: number;
  /** Default due days (0 = on receipt, 7/14/30). */
  dueDays: number;
  /** Payment terms paragraph. */
  termsText: string;
  /** Footer note (merge fields allowed at render). */
  footerNote: string;
  /** Late-fee policy line (display-only in v1). */
  latePolicy: string;
  /** Default notes block. */
  memo: string;
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  numberPrefix: "",
  numberPadding: 4,
  resetYearly: false,
  taxLabel: "",
  taxRateBps: 0,
  dueDays: 0,
  termsText: "",
  footerNote: "",
  latePolicy: "",
  memo: "",
};

function str(v: unknown, cap: number): string {
  return typeof v === "string" ? v.trim().slice(0, cap) : "";
}

export function parseInvoiceSettings(json: string | null | undefined): InvoiceSettings {
  if (!json) return { ...DEFAULT_INVOICE_SETTINGS };
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return {
      numberPrefix: str(raw.numberPrefix, 12).replace(/[^A-Za-z0-9_-]/g, ""),
      numberPadding: typeof raw.numberPadding === "number" ? Math.min(6, Math.max(3, Math.floor(raw.numberPadding))) : 4,
      resetYearly: raw.resetYearly === true,
      taxLabel: str(raw.taxLabel, 30),
      taxRateBps: typeof raw.taxRateBps === "number" ? Math.min(20000, Math.max(0, Math.floor(raw.taxRateBps))) : 0,
      dueDays: typeof raw.dueDays === "number" ? Math.min(120, Math.max(0, Math.floor(raw.dueDays))) : 0,
      termsText: str(raw.termsText, 500),
      footerNote: str(raw.footerNote, 500),
      latePolicy: str(raw.latePolicy, 200),
      memo: str(raw.memo, 500),
    };
  } catch {
    return { ...DEFAULT_INVOICE_SETTINGS };
  }
}

/** Tax for a subtotal in minor units (rounded, basis points). */
export function taxFor(subtotalMinor: number, rateBps: number): number {
  if (rateBps <= 0) return 0;
  return Math.round((subtotalMinor * rateBps) / 10000);
}

/** Subtotal of invoice lines (qty-aware — mirrors the existing composer). */
export function subtotalOf(lines: Array<{ qty: number; amountMinor: number }>): number {
  return lines.reduce((n, l) => n + (l.qty > 0 ? l.amountMinor * l.qty : l.amountMinor), 0);
}

/** Package presets (template kind invoice_preset) — body JSON: lines[]. */
export type PresetLine = { description: string; qty: number; amountMinor: number };

export function parsePresetLines(body: string): PresetLine[] {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: PresetLine[] = [];
    for (const l of parsed.slice(0, 50)) {
      if (!l || typeof l !== "object") continue;
      const line = l as Record<string, unknown>;
      const description = typeof line.description === "string" ? line.description.trim().slice(0, 200) : "";
      const qty = typeof line.qty === "number" && Number.isFinite(line.qty) ? Math.min(999, Math.max(1, Math.floor(line.qty))) : 1;
      const amountMinor = typeof line.amountMinor === "number" && Number.isFinite(line.amountMinor) ? Math.min(100_000_000, Math.max(0, Math.round(line.amountMinor))) : 0;
      if (description && amountMinor > 0) out.push({ description, qty, amountMinor });
    }
    return out;
  } catch {
    return [];
  }
}

export const STARTER_PRESETS: Array<{ name: string; lines: PresetLine[] }> = [
  {
    name: "Wedding Collection",
    lines: [
      { description: "Full-day wedding coverage (8 hours)", qty: 1, amountMinor: 240000 },
      { description: "Second photographer", qty: 1, amountMinor: 45000 },
      { description: "Album credit", qty: 1, amountMinor: 30000 },
    ],
  },
  {
    name: "Portrait Session",
    lines: [
      { description: "60-minute portrait session", qty: 1, amountMinor: 25000 },
      { description: "Extra retouched image set (10)", qty: 1, amountMinor: 7500 },
    ],
  },
  {
    name: "Mini Session",
    lines: [{ description: "20-minute mini session", qty: 1, amountMinor: 12500 }],
  },
];
