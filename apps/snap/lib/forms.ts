/* Forms engine (WEB-248) — one field schema powering the contact widget
 * (3/10), booking intake questions (4/10) and standalone questionnaires.
 * The schema is validated EVERYWHERE it is consumed: at template save, at
 * public render, and at submit — the posted payload is never trusted to
 * match the schema the client claims. */
export const FORM_FIELD_KINDS = ["text", "textarea", "select", "radio", "checkbox", "date", "email", "phone", "file"] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export type FormField = {
  id: string;
  kind: FormFieldKind;
  label: string;
  required: boolean;
  /** select/radio only. */
  options?: string[];
  help?: string;
  placeholder?: string;
  /** Render at half width next to the previous half field. */
  half?: boolean;
};

export type FormSchema = {
  v: 1;
  title?: string;
  intro?: string;
  thankYou?: string;
  fields: FormField[];
};

export const FORM_MAX_FIELDS = 50;
export const FORM_MAX_OPTIONS = 20;
export const FORM_FILE_MAX_BYTES = 20 * 1024 * 1024;

const FIELD_ID_RE = /^f[A-Za-z0-9_]{0,39}$/;

function str(v: unknown, cap: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length <= cap ? s : null;
}

/** Strict schema validation — returns a normalized schema or null. File
 * fields are Studio-gated server-side (allowFile=false strips+rejects). */
export function validateFormSchema(input: unknown, opts: { allowFile?: boolean } = {}): FormSchema | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.fields) || raw.fields.length < 1 || raw.fields.length > FORM_MAX_FIELDS) return null;
  const fields: FormField[] = [];
  const seen = new Set<string>();
  for (const rf of raw.fields) {
    if (!rf || typeof rf !== "object") return null;
    const f = rf as Record<string, unknown>;
    const kind = typeof f.kind === "string" && (FORM_FIELD_KINDS as readonly string[]).includes(f.kind) ? (f.kind as FormFieldKind) : null;
    if (!kind) return null;
    if (kind === "file" && !opts.allowFile) return null;
    const id = typeof f.id === "string" ? f.id : "";
    if (!FIELD_ID_RE.test(id) || seen.has(id)) return null;
    seen.add(id);
    const label = str(f.label, 120);
    if (!label) return null;
    const field: FormField = { id, kind, label, required: f.required === true };
    if (f.help !== undefined) {
      const help = str(f.help, 200);
      if (help === null) return null;
      if (help) field.help = help;
    }
    if (f.placeholder !== undefined) {
      const ph = str(f.placeholder, 120);
      if (ph === null) return null;
      if (ph) field.placeholder = ph;
    }
    if (f.half !== undefined) field.half = f.half === true;
    if (kind === "select" || kind === "radio") {
      // required selects still need a real option list ("mismatched required
      // options" rejection): 1..20 unique non-empty options.
      if (!Array.isArray(f.options) || f.options.length < 1 || f.options.length > FORM_MAX_OPTIONS) return null;
      const options: string[] = [];
      for (const o of f.options) {
        const os = str(o, 100);
        if (!os || options.includes(os)) return null;
        options.push(os);
      }
      field.options = options;
    } else if (f.options !== undefined) {
      return null; // options on a non-choice field = malformed
    }
    fields.push(field);
  }
  const schema: FormSchema = { v: 1, fields };
  if (raw.title !== undefined) {
    const title = str(raw.title, 120);
    if (title === null) return null;
    if (title) schema.title = title;
  }
  if (raw.intro !== undefined) {
    const intro = str(raw.intro, 600);
    if (intro === null) return null;
    if (intro) schema.intro = intro;
  }
  if (raw.thankYou !== undefined) {
    const ty = str(raw.thankYou, 300);
    if (ty === null) return null;
    if (ty) schema.thankYou = ty;
  }
  return schema;
}

/** Parse a template row's stored JSON body into a schema (null when the
 * body is not a valid schema — the public renderer treats that as "form
 * unavailable" rather than rendering garbage). */
export function parseFormSchema(body: string, opts: { allowFile?: boolean } = {}): FormSchema | null {
  try {
    return validateFormSchema(JSON.parse(body), opts);
  } catch {
    return null;
  }
}

export type FileAnswer = { key: string; name: string; bytes: number; token?: string };
export type FormAnswers = {
  /** string values; checkbox answers are "yes"/"no". */
  answers: Record<string, string>;
  files: Record<string, FileAnswer>;
};

export type AnswerError = { field: string; reason: string };

/** Validate submitted answers against the STORED schema. Values arrive as
 * strings (form data) or booleans (checkbox); everything is coerced and
 * capped server-side. Returns per-field errors; values drop to "" when
 * absent so callers can merge with standard lead columns. */
export function validateFormAnswers(schema: FormSchema, posted: unknown): { ok: true; result: FormAnswers } | { ok: false; errors: AnswerError[] } {
  const bag = posted && typeof posted === "object" && !Array.isArray(posted) ? (posted as Record<string, unknown>) : {};
  const answers: Record<string, string> = {};
  const files: Record<string, FileAnswer> = {};
  const errors: AnswerError[] = [];
  for (const f of schema.fields) {
    const raw = bag[f.id];
    if (f.kind === "checkbox") {
      answers[f.id] = raw === true || raw === "true" || raw === "on" || raw === "yes" ? "yes" : "no";
      if (f.required && answers[f.id] !== "yes") errors.push({ field: f.id, reason: "required" });
      continue;
    }
    if (f.kind === "file") {
      if (raw && typeof raw === "object") {
        const fraw = raw as Record<string, unknown>;
        const key = typeof fraw.key === "string" ? fraw.key : "";
        const name = typeof fraw.name === "string" ? fraw.name.slice(0, 255) : "";
        const bytes = typeof fraw.bytes === "number" && Number.isFinite(fraw.bytes) ? Math.floor(fraw.bytes) : 0;
        const token = typeof fraw.token === "string" ? fraw.token.slice(0, 200) : "";
        if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]{1,12}$/.test(key) || !name || bytes < 1 || bytes > FORM_FILE_MAX_BYTES) {
          errors.push({ field: f.id, reason: "invalid_file" });
        } else {
          files[f.id] = { key, name, bytes, token };
        }
      } else if (f.required) {
        errors.push({ field: f.id, reason: "required" });
      }
      continue;
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (f.required) errors.push({ field: f.id, reason: "required" });
      answers[f.id] = "";
      continue;
    }
    switch (f.kind) {
      case "textarea":
        if (value.length > 4000) errors.push({ field: f.id, reason: "too_long" });
        break;
      case "text":
        if (value.length > 500) errors.push({ field: f.id, reason: "too_long" });
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) || value.length > 200) errors.push({ field: f.id, reason: "invalid_email" });
        break;
      case "phone":
        if (value.length > 40 || !/^[+()\-.\s\d]+$/.test(value)) errors.push({ field: f.id, reason: "invalid_phone" });
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00Z`).getTime())) errors.push({ field: f.id, reason: "invalid_date" });
        break;
      case "select":
      case "radio":
        if (!f.options?.includes(value)) errors.push({ field: f.id, reason: "invalid_option" });
        break;
    }
    answers[f.id] = value.slice(0, 4000);
  }
  // Unknown keys in the payload are ignored wholesale (schema-spoofing guard).
  return errors.length ? { ok: false, errors } : { ok: true, result: { answers, files } };
}

/** Standard lead columns a schema may capture (first-class since WEB-113);
 * custom answers land in lead.custom_fields. */
export const LEAD_STANDARD_FIELDS = ["name", "email", "phone", "eventDate", "eventType", "message"] as const;
export type LeadStandardField = (typeof LEAD_STANDARD_FIELDS)[number];

export const LEAD_FIELD_MAPPINGS: Record<LeadStandardField, { label: string; kind: FormFieldKind }> = {
  name: { label: "Name", kind: "text" },
  email: { label: "Email", kind: "email" },
  phone: { label: "Phone", kind: "phone" },
  eventDate: { label: "Event date", kind: "date" },
  eventType: { label: "What kind of shoot?", kind: "select" },
  message: { label: "Tell us more", kind: "textarea" },
};

/** Build the lead-column mapping for a form: a field maps to a standard
 * column when its id is `f_name`/`f_email`/… (starter convention) AND its
 * kind matches. Everything else is custom. */
export function mapLeadColumns(schema: FormSchema): { standard: Partial<Record<LeadStandardField, string>>; custom: Record<string, string> } {
  const standard: Partial<Record<LeadStandardField, string>> = {};
  const custom: Record<string, string> = {};
  for (const f of schema.fields) {
    const col = f.id.replace(/^f_/, "") as LeadStandardField;
    const mapping = LEAD_FIELD_MAPPINGS[col];
    if ((LEAD_STANDARD_FIELDS as readonly string[]).includes(col) && mapping && mapping.kind === f.kind) {
      standard[col] = f.id;
    } else if (f.kind !== "file") {
      custom[f.id] = f.label;
    }
  }
  return { standard, custom };
}

/** Serialize custom answers for lead.custom_fields: { fieldId: {label, value} }. */
export function packLeadCustomFields(schema: FormSchema, answers: FormAnswers): string {
  const { custom } = mapLeadColumns(schema);
  const out: Record<string, { label: string; value: string }> = {};
  for (const [fieldId, label] of Object.entries(custom)) {
    const v = answers.answers[fieldId];
    if (v) out[fieldId] = { label, value: v };
  }
  for (const [fieldId, file] of Object.entries(answers.files)) {
    const field = schema.fields.find((f) => f.id === fieldId);
    // Persist key/name/bytes only — the presign HMAC has no value later.
    out[fieldId] = { label: field?.label ?? "File", value: JSON.stringify({ file: { key: file.key, name: file.name, bytes: file.bytes } }) };
  }
  return JSON.stringify(out);
}

/** Parse lead.custom_fields for display: [{label, value, file?}]. */
export function unpackLeadCustomFields(json: string | null | undefined): Array<{ label: string; value: string; file?: { key: string; name: string; bytes: number } }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Record<string, { label?: string; value?: string }>;
    return Object.values(parsed)
      .filter((e): e is { label: string; value: string } => typeof e?.value === "string" && typeof e?.label === "string")
      .map((e) => {
        if (e.value.startsWith('{"file":')) {
          try {
            const file = (JSON.parse(e.value) as { file?: { key: string; name: string; bytes: number } }).file;
            if (file?.key) return { label: e.label, value: file.name, file };
          } catch {
            /* fall through to text */
          }
        }
        return { label: e.label, value: e.value };
      });
  } catch {
    return [];
  }
}

/** The canonical contact-form schema (WEB-249): byte-parity with the
 * pre-designer hardcoded widget — the starter "General intake" template and
 * the widget's no-template fallback both render exactly this. Copy fields/
 * labels/options stay lead-column compatible. */
export const DEFAULT_CONTACT_FORM_BODY = JSON.stringify({
  v: 1,
  title: "Get in touch",
  intro: "Tell us about your shoot — we usually reply within a day.",
  thankYou: "Thank you — your inquiry is in! We'll get back to you shortly.",
  fields: [
    { id: "f_name", kind: "text", label: "Name", required: true, half: true },
    { id: "f_email", kind: "email", label: "Email", required: true, half: true },
    { id: "f_phone", kind: "phone", label: "Phone", required: false, half: true },
    { id: "f_eventDate", kind: "date", label: "Event date", required: false, half: true },
    { id: "f_eventType", kind: "select", label: "What kind of shoot?", required: false, options: ["Wedding", "Engagement", "Family", "Portrait", "Event", "Commercial", "Other"] },
    { id: "f_message", kind: "textarea", label: "Tell us more", required: false },
  ],
} satisfies FormSchema);

/** Free/Lite cap: custom (non-lead-column) fields allowed on a form. */
export const FREE_CUSTOM_FIELD_CAP = 2;

/** Count a schema's custom fields (everything that is not a standard lead
 * column mapping). */
export function countCustomFields(schema: FormSchema): number {
  const { standard } = mapLeadColumns(schema);
  const mapped = new Set(Object.values(standard));
  return schema.fields.filter((f) => !mapped.has(f.id)).length;
}
