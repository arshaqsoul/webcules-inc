/* WEB-277 business identity — the legal-adjacent layer (legal name,
 * address, tax id, phone, website) that invoices, contracts, and merge
 * fields draw from. Pure: parse/validate/format only; storage is the
 * studio_profiles.business JSON bag (≤ 4 KB), per-org by construction. */
export type BusinessIdentity = {
  /** Defaults to the studio name when unset. */
  legalName: string;
  addressLines: string[]; // ≤ 3
  /** Label-aware tax id ("GST", "VAT", "EIN", or a custom label). */
  taxId: { label: string; value: string } | null;
  phone: string;
  website: string;
};

export const TAX_LABELS = ["GST", "VAT", "EIN", "Other"] as const;

const MAX_JSON_BYTES = 4096;

export function emptyBusiness(studioName: string): BusinessIdentity {
  return { legalName: studioName, addressLines: ["", "", ""], taxId: null, phone: "", website: "" };
}

/** Parse the stored JSON — corrupt or partial bags degrade to defaults,
 * never throw (the card always renders). */
export function parseBusiness(json: string | null | undefined, studioName: string): BusinessIdentity {
  const base = emptyBusiness(studioName);
  if (!json) return base;
  try {
    const raw = JSON.parse(json) as Partial<{
      legalName: string;
      addressLines: string[];
      taxId: { label: string; value: string };
      phone: string;
      website: string;
    }>;
    return {
      legalName: typeof raw.legalName === "string" && raw.legalName.trim() ? raw.legalName.trim().slice(0, 120) : base.legalName,
      addressLines:
        Array.isArray(raw.addressLines) && raw.addressLines.some((l) => typeof l === "string" && l.trim())
          ? [0, 1, 2].map((i) => (typeof raw.addressLines?.[i] === "string" ? raw.addressLines[i].trim().slice(0, 120) : ""))
          : base.addressLines,
      taxId:
        raw.taxId && typeof raw.taxId.value === "string" && raw.taxId.value.trim()
          ? { label: (raw.taxId.label || "Tax ID").trim().slice(0, 12), value: raw.taxId.value.trim().slice(0, 40) }
          : null,
      phone: typeof raw.phone === "string" ? raw.phone.trim().slice(0, 40) : "",
      website: typeof raw.website === "string" ? raw.website.trim().slice(0, 120) : "",
    };
  } catch {
    return base;
  }
}

/** True when any identity field is actually set (surfaces render
 * conditionally — absent fields = today's output). */
export function hasBusinessIdentity(b: BusinessIdentity): boolean {
  return Boolean(
    b.addressLines.some((l) => l) || b.taxId || b.phone || b.website || b.legalName.trim(),
  ) && Boolean(b.addressLines.some((l) => l) || b.taxId || b.phone || b.website);
}

/** Serialize for storage; null when nothing meaningful is set (the column
 * stays clean and the PDFs stay exactly as today). */
export function serializeBusiness(b: BusinessIdentity, studioName: string): string | null {
  const clean: BusinessIdentity = {
    legalName: b.legalName.trim().slice(0, 120) || studioName,
    addressLines: b.addressLines.map((l) => l.trim().slice(0, 120)).filter(Boolean).slice(0, 3),
    taxId: b.taxId && b.taxId.value.trim() ? { label: (b.taxId.label || "Tax ID").trim().slice(0, 12), value: b.taxId.value.trim().slice(0, 40) } : null,
    phone: b.phone.trim().slice(0, 40),
    website: b.website.trim().slice(0, 120),
  };
  if (!clean.addressLines.length && !clean.taxId && !clean.phone && !clean.website && clean.legalName === studioName) {
    return null;
  }
  const json = JSON.stringify(clean);
  if (json.length > MAX_JSON_BYTES) throw new Error("business_details_too_large");
  return json;
}

/** One-line address for merge fields / small print. */
export function businessAddressLine(b: BusinessIdentity): string {
  return b.addressLines.filter(Boolean).join(", ");
}

/** "GST reg. no. 12345" style small print; label-aware. */
export function taxIdLine(b: BusinessIdentity): string {
  if (!b.taxId) return "";
  const label = b.taxId.label.toUpperCase();
  if (label === "GST" || label === "VAT") return `${label} reg. no. ${b.taxId.value}`;
  if (label === "EIN") return `EIN ${b.taxId.value}`;
  return `${b.taxId.label}: ${b.taxId.value}`;
}
