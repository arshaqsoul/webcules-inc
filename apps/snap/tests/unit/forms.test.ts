/* WEB-248 forms engine units — schema validation rejections, per-kind
 * answer validation (incl. schema-spoofing resistance), lead-column
 * mapping and custom-field packing. Pure, no DB. */
import { describe, expect, it } from "vitest";

import {
  countCustomFields,
  FREE_CUSTOM_FIELD_CAP,
  LEAD_FIELD_MAPPINGS,
  mapLeadColumns,
  packLeadCustomFields,
  unpackLeadCustomFields,
  validateFormAnswers,
  validateFormSchema,
} from "@/lib/forms";

const base = { v: 1, fields: [{ id: "f_name", kind: "text", label: "Name", required: true }] };

describe("validateFormSchema (WEB-248)", () => {
  it("accepts a valid schema and normalizes it", () => {
    const s = validateFormSchema({
      ...base,
      fields: [
        { id: "f_name", kind: "text", label: "Name", required: true, help: "  ", placeholder: "" },
        { id: "f_kind", kind: "select", label: "Type", required: false, options: ["A", "B"] },
      ],
    });
    expect(s).not.toBeNull();
    expect(s!.fields[0].help).toBeUndefined();
    expect(s!.fields[0].placeholder).toBeUndefined();
  });

  it("rejects unknown kinds", () => {
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "tel", label: "x", required: false }] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "matrix", label: "x", required: false }] })).toBeNull();
  });

  it("rejects >50 fields and 0 fields", () => {
    expect(validateFormSchema({ v: 1, fields: [] })).toBeNull();
    const many = Array.from({ length: 51 }, (_, i) => ({ id: `f_${i}`, kind: "text", label: "x", required: false }));
    expect(validateFormSchema({ v: 1, fields: many })).toBeNull();
    const fifty = many.slice(0, 50);
    expect(validateFormSchema({ v: 1, fields: fifty })).not.toBeNull();
  });

  it("rejects option overflow, duplicate options, empty options, and options on non-choice fields", () => {
    const options = (n: number) => Array.from({ length: n }, (_, i) => `O${i}`);
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "select", label: "x", required: false, options: options(21) }] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "select", label: "x", required: false, options: [] }] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "radio", label: "x", required: false, options: ["A", "A"] }] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "text", label: "x", required: false, options: ["A"] }] })).toBeNull();
  });

  it("rejects bad ids (dupes, wrong shape), labels, and help over caps", () => {
    expect(validateFormSchema({ v: 1, fields: [base.fields[0], base.fields[0]] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "F-X", kind: "text", label: "x", required: false }] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "text", label: "", required: false }] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "text", label: "x".repeat(121), required: false }] })).toBeNull();
    expect(validateFormSchema({ v: 1, fields: [{ id: "f1", kind: "text", label: "x", required: false, help: "h".repeat(201) }] })).toBeNull();
  });

  it("gates file fields on allowFile (Studio-only)", () => {
    const withFile = { v: 1, fields: [{ id: "f1", kind: "file", label: "Ref", required: false }] };
    expect(validateFormSchema(withFile)).toBeNull();
    expect(validateFormSchema(withFile, { allowFile: true })).not.toBeNull();
  });
});

describe("validateFormAnswers (WEB-248)", () => {
  const schema = validateFormSchema({
    v: 1,
    fields: [
      { id: "f_name", kind: "text", label: "Name", required: true },
      { id: "f_email", kind: "email", label: "Email", required: true },
      { id: "f_phone", kind: "phone", label: "Phone", required: false },
      { id: "f_when", kind: "date", label: "When", required: false },
      { id: "f_pick", kind: "select", label: "Pick", required: false, options: ["A", "B"] },
      { id: "f_ok", kind: "checkbox", label: "OK to text", required: true },
      { id: "f_notes", kind: "textarea", label: "Notes", required: false },
    ],
  })!;

  it("validates every kind and coerces checkbox answers", () => {
    const out = validateFormAnswers(schema, {
      f_name: " Maya ",
      f_email: "maya@example.com",
      f_phone: "+1 (555) 010-0000",
      f_when: "2027-06-14",
      f_pick: "A",
      f_ok: true,
      f_notes: "hello",
      injected_field: "hack",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answers.f_name).toBe("Maya");
    expect(out.result.answers.f_ok).toBe("yes");
    expect("injected_field" in out.result.answers).toBe(false); // spoofed keys ignored
  });

  it("flags required, bad email/phone/date, and out-of-option values", () => {
    const out = validateFormAnswers(schema, { f_name: "", f_email: "nope", f_phone: "call me", f_when: "2027-13-99", f_pick: "C", f_ok: "no" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    const byReason = Object.fromEntries(out.errors.map((e) => [e.field, e.reason]));
    expect(byReason.f_name).toBe("required");
    expect(byReason.f_email).toBe("invalid_email");
    expect(byReason.f_phone).toBe("invalid_phone");
    expect(byReason.f_when).toBe("invalid_date");
    expect(byReason.f_pick).toBe("invalid_option");
    expect(byReason.f_ok).toBe("required");
  });

  it("caps textarea length", () => {
    const out = validateFormAnswers(schema, { f_name: "x", f_email: "x@x.co", f_ok: "yes", f_notes: "n".repeat(4001) });
    expect(out.ok).toBe(false);
  });

  it("file answers ride as key/name/bytes/token objects", () => {
    const s = validateFormSchema({ v: 1, fields: [{ id: "f_ref", kind: "file", label: "Ref", required: true }] }, { allowFile: true })!;
    const ok = validateFormAnswers(s, { f_ref: { key: "org-123/form-files/abc/moodboard.png", name: "moodboard.png", bytes: 1000, token: "t" } });
    expect(ok.ok).toBe(true);
    const bad = validateFormAnswers(s, { f_ref: { key: "../../etc/passwd", name: "x", bytes: 10 } });
    expect(bad.ok).toBe(false);
    const missing = validateFormAnswers(s, {});
    expect(missing.ok).toBe(false);
  });
});

describe("lead mapping (WEB-248)", () => {
  it("maps standard-convention fields to lead columns, the rest to custom", () => {
    const schema = validateFormSchema({
      v: 1,
      fields: [
        { id: "f_name", kind: "text", label: "Name", required: true },
        { id: "f_email", kind: "email", label: "Email", required: true },
        { id: "f_eventDate", kind: "date", label: "When", required: false },
        { id: "f_eventType", kind: "select", label: "Type", required: false, options: ["Wedding"] },
        { id: "f_venue", kind: "text", label: "Venue", required: false },
      ],
    })!;
    const { standard, custom } = mapLeadColumns(schema);
    expect(standard.name).toBe("f_name");
    expect(standard.email).toBe("f_email");
    expect(standard.eventDate).toBe("f_eventDate");
    expect(standard.eventType).toBe("f_eventType");
    expect(custom).toEqual({ f_venue: "Venue" });
  });

  it("packs and unpacks custom fields (files included) losslessly for display", () => {
    const schema = validateFormSchema(
      {
        v: 1,
        fields: [
          { id: "f_name", kind: "text", label: "Name", required: true },
          { id: "f_venue", kind: "text", label: "Venue", required: false },
          { id: "f_ref", kind: "file", label: "Moodboard", required: false },
        ],
      },
      { allowFile: true },
    )!;
    const packed = packLeadCustomFields(schema, {
      answers: { f_name: "Maya", f_venue: "The Barn" },
      files: { f_ref: { key: "o/form-files/a/mood.png", name: "mood.png", bytes: 2048 } },
    });
    const unpacked = unpackLeadCustomFields(packed);
    expect(unpacked).toEqual([
      { label: "Venue", value: "The Barn" },
      { label: "Moodboard", value: "mood.png", file: { key: "o/form-files/a/mood.png", name: "mood.png", bytes: 2048 } },
    ]);
    expect(unpackLeadCustomFields(null)).toEqual([]);
    expect(unpackLeadCustomFields("{broken")).toEqual([]);
  });

  it("lead mappings cover the standard set with matching kinds", () => {
    const kinds: Record<string, string> = Object.fromEntries(Object.entries(LEAD_FIELD_MAPPINGS).map(([k, v]) => [k, v.kind]));
    expect(kinds).toEqual({ name: "text", email: "email", phone: "phone", eventDate: "date", eventType: "select", message: "textarea" });
  });
});

describe("custom-field cap (WEB-249)", () => {
  it("counts non-lead-column fields", () => {
    const schema = validateFormSchema({
      v: 1,
      fields: [
        { id: "f_name", kind: "text", label: "Name", required: true },
        { id: "f_email", kind: "email", label: "Email", required: true },
        { id: "f_venue", kind: "text", label: "Venue", required: false },
        { id: "f_ig", kind: "text", label: "Instagram", required: false },
        { id: "f_dogs", kind: "text", label: "Dogs", required: false },
      ],
    })!;
    expect(FREE_CUSTOM_FIELD_CAP).toBe(2);
    expect(countCustomFields(schema)).toBe(3);
    const within = validateFormSchema({ v: 1, fields: schema.fields.slice(0, 4) })!;
    expect(countCustomFields(within)).toBe(2);
  });
});
