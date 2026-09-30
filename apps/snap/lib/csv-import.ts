/* WEB-276 CSV import — pure parsing/mapping/validation, shared by the
 * browser (live preview + mapping UI) and the server (authoritative pass;
 * the client's work is never trusted). No DB imports on purpose. */

export const IMPORT_MAX_ROWS = 10_000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Canonical column keys the importer understands. */
export type ImportField = "name" | "email" | "phone" | "eventDate" | "eventType" | "notes" | "source";

export const IMPORT_FIELDS: { key: ImportField; label: string; required?: boolean }[] = [
  { key: "email", label: "Email", required: true },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "eventDate", label: "Event date" },
  { key: "eventType", label: "Event type" },
  { key: "notes", label: "Notes" },
  { key: "source", label: "Source" },
];

const HEADER_GUESSES: Record<ImportField, string[]> = {
  email: ["email", "email address", "e-mail", "mail"],
  name: ["name", "full name", "client", "client name", "contact", "contact name", "first name"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone", "tel"],
  eventDate: ["event date", "date", "shoot date", "wedding date", "session date", "booking date"],
  eventType: ["event type", "type", "session type", "shoot type", "category"],
  notes: ["notes", "note", "message", "comments", "details", "description"],
  source: ["source", "referral", "lead source", "how they found us"],
};

/* ---------------- CSV tokenizer (RFC-4180-ish) ---------------- */

/** Sniff the delimiter from the first line (, ; or tab). */
function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Array<[string, number]> = [
    [",", (firstLine.match(/,/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
    ["\t", (firstLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Parse CSV text into rows of cells: quoted commas, escaped quotes (""), CRLF,
 * trailing newline, UTF-8 BOM. */
export function tokenizeCsv(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const d = delimiter ?? sniffDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === d) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // drop fully-empty trailing rows (blank lines in exports are common)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ---------------- Mapping ---------------- */

export type Mapping = Partial<Record<ImportField, number>>;

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Guess field → column index from the header row. */
export function guessMapping(header: string[]): Mapping {
  const normalized = header.map(normHeader);
  const mapping: Mapping = {};
  for (const [field, guesses] of Object.entries(HEADER_GUESSES) as Array<[ImportField, string[]]>) {
    // exact match first, then "contains" (e.g. "Client Email" → email)
    let idx = normalized.findIndex((h) => guesses.includes(h));
    if (idx < 0) idx = normalized.findIndex((h) => guesses.some((g) => h === g || (g.length > 4 && h.includes(g))));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

/* ---------------- Row shaping + validation ---------------- */

export type ShapedRow = {
  row: number; // 1-based line in the file (header excluded)
  email: string;
  name: string | null;
  phone: string | null;
  eventDate: string | null; // normalized YYYY-MM-DD (tz-naive; studio tz applies downstream)
  eventType: string | null;
  notes: string | null;
  source: string | null;
};

export type RowError = { row: number; reason: string; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Accept YYYY-MM-DD, M/D/YYYY, D-M-YYYY, YYYY/M/D, "Mar 5 2027"-ish via Date
 * fallback. Returns YYYY-MM-DD or null (unmappable dates are reported, not guessed). */
export function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    // Ambiguous 3/4/2027 — treat as M/D/Y (US export default); the mapping
    // screen tells the studio so they can fix the source file if wrong.
    const a = Number(m[1]);
    const b = Number(m[2]);
    const month = a <= 12 ? a : b;
    const day = a <= 12 ? b : a;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/** Shape raw cells through the mapping into canonical rows + per-row errors. */
export function shapeRows(rows: string[][], mapping: Mapping): { shaped: ShapedRow[]; errors: RowError[] } {
  const shaped: ShapedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const at = (f: ImportField): string => {
      const idx = mapping[f];
      return idx === undefined ? "" : String(cells[idx] ?? "").trim();
    };
    const email = at("email").toLowerCase();
    if (!email) {
      errors.push({ row: i + 1, reason: "missing email" });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ row: i + 1, reason: `invalid email: ${email}`, email });
      continue;
    }
    if (seen.has(email)) {
      errors.push({ row: i + 1, reason: `duplicate of an earlier row (${email})`, email });
      continue;
    }
    seen.add(email);
    const rawDate = at("eventDate");
    const eventDate = rawDate ? normalizeDate(rawDate) : null;
    if (rawDate && !eventDate) {
      errors.push({ row: i + 1, reason: `unrecognized date: ${rawDate}`, email });
      continue;
    }
    shaped.push({
      row: i + 1,
      email,
      name: at("name") || null,
      phone: at("phone") || null,
      eventDate,
      eventType: at("eventType") || null,
      notes: at("notes") || null,
      source: at("source") || null,
    });
  }
  return { shaped, errors };
}

export type ParsedCsv =
  | { ok: false; error: string }
  | { ok: true; header: string[]; rows: string[][]; mapping: Mapping; shaped: ShapedRow[]; errors: RowError[] };

/** Full client-side parse: text → header/mapping/rows/errors with limits. */
export function parseImportCsv(text: string): ParsedCsv {
  if (text.length > IMPORT_MAX_BYTES) return { ok: false, error: `File too large — keep it under 5 MB.` };
  const all = tokenizeCsv(text);
  if (all.length < 2) return { ok: false, error: "No data rows found under the header." };
  const [header, ...rows] = all;
  if (rows.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: `Too many rows (${rows.length}) — the limit is ${IMPORT_MAX_ROWS}.` };
  }
  const mapping = guessMapping(header);
  if (mapping.email === undefined) {
    return { ok: false, error: "Couldn't find an email column — map it manually after choosing the file." };
  }
  const { shaped, errors } = shapeRows(rows, mapping);
  return { ok: true, header, rows, mapping, shaped, errors };
}

/** Build a downloadable failures CSV (report → "download errors"). */
export function failureCsv(errors: RowError[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ["row,reason,email", ...errors.map((e) => `${e.row},${esc(e.reason)},${esc(e.email ?? "")}`)].join("\r\n");
}
