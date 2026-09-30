"use client";

/* Forms builder (WEB-248) — structure-first editor over a form template's
 * schema: add/edit/reorder fields, kind picker, options editor, required +
 * half-width toggles, and a live preview iframe rendering the REAL public
 * renderer output. Visual polish lands with the 3/10 contact designer. */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { UpgradeCta } from "@/components/lite-upsell";
import { FORM_FIELD_KINDS, type FormField, type FormFieldKind, type FormSchema } from "@/lib/forms";

type DraftField = FormField & { key: string };

const KIND_LABELS: Record<FormFieldKind, string> = {
  text: "Text",
  textarea: "Long text",
  select: "Dropdown",
  radio: "Multiple choice",
  checkbox: "Checkbox",
  date: "Date",
  email: "Email",
  phone: "Phone",
  file: "File upload",
};

function toDraft(schema: FormSchema): DraftField[] {
  return schema.fields.map((f, i) => ({ ...f, options: f.options ? [...f.options] : undefined, key: `${f.id}-${i}` }));
}

export function FormBuilder({
  templateId,
  initialName,
  initialSchema,
  initialMeta,
  allowFile,
  customFieldCap,
}: {
  templateId: string;
  initialName: string;
  initialSchema: FormSchema;
  initialMeta: { submitLabel?: string; redirectUrl?: string };
  allowFile: boolean;
  customFieldCap: number | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState(initialSchema.title ?? "");
  const [intro, setIntro] = useState(initialSchema.intro ?? "");
  const [thankYou, setThankYou] = useState(initialSchema.thankYou ?? "");
  const [fields, setFields] = useState<DraftField[]>(() => toDraft(initialSchema));
  const [submitLabel, setSubmitLabel] = useState(initialMeta.submitLabel ?? "");
  const [redirectUrl, setRedirectUrl] = useState(initialMeta.redirectUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Studio-gate errors (file fields / custom-question cap) ride with a CTA. */
  const [upsell, setUpsell] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const nextId = useRef(initialSchema.fields.length);

  const kinds = useMemo(() => FORM_FIELD_KINDS.filter((k) => allowFile || k !== "file"), [allowFile]);

  function patchField(key: string, patch: Partial<DraftField>) {
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }
  function move(key: string, dir: -1 | 1) {
    setFields((fs) => {
      const i = fs.findIndex((f) => f.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= fs.length) return fs;
      const next = [...fs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addField(kind: FormFieldKind) {
    nextId.current += 1;
    setFields((fs) => [
      ...fs,
      {
        key: `new-${nextId.current}-${crypto.randomUUID().slice(0, 6)}`,
        id: `f_${kind}_${nextId.current}`.toLowerCase(),
        kind,
        label: KIND_LABELS[kind],
        required: false,
        ...(kind === "select" || kind === "radio" ? { options: ["Option 1", "Option 2"] } : {}),
      },
    ]);
  }

  async function save(preview: boolean) {
    setUpsell(false);
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const schema: FormSchema = {
        v: 1,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(intro.trim() ? { intro: intro.trim() } : {}),
        ...(thankYou.trim() ? { thankYou: thankYou.trim() } : {}),
        fields: fields.map(({ key: _key, ...f }) => f),
      };
      const res = await fetch(`/api/studio/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Untitled form",
          body: JSON.stringify(schema),
          meta: {
            ...(submitLabel.trim() ? { submitLabel: submitLabel.trim().slice(0, 40) } : {}),
            ...(redirectUrl.trim() ? { redirectUrl: redirectUrl.trim() } : {}),
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setUpsell(body.error === "file_fields_require_studio" || body.error === "custom_fields_limit");
        setError(
          body.error === "invalid_schema"
            ? "Some fields are invalid — check ids, labels and options."
            : body.error === "file_fields_require_studio"
              ? "File fields need the Studio plan."
              : body.error === "custom_fields_limit"
                ? `Free plans allow ${customFieldCap} custom questions — Studio is unlimited.`
                : body.error === "invalid_redirect"
                  ? "Redirect URL must start with https://"
                  : "Couldn't save — try again.",
        );
        return;
      }
      if (preview) setPreviewKey((k) => k + 1);
      else router.refresh();
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <h2 className="text-[15px] font-medium text-ink">Form basics</h2>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-subtle">
              Template name (internal)
              <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-subtle">
              Form heading
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Get in touch" className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-subtle">
              Intro line
              <textarea value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Tell us about your shoot — we usually reply within a day." className="min-h-16 rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-subtle">
              Thank-you message
              <input value={thankYou} onChange={(e) => setThankYou(e.target.value)} placeholder="Thank you — we got it!" className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-ink-subtle">
                Submit button label
                <input value={submitLabel} onChange={(e) => setSubmitLabel(e.target.value)} placeholder="Send inquiry" className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-subtle">
                Redirect after submit (https, optional)
                <input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://yourstudio.com/thanks" className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-ink">Fields ({fields.length}/50)</h2>
            <div className="flex flex-wrap gap-1.5">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addField(k)}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-subtle transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <Plus className="mr-1 inline h-3 w-3" aria-hidden />
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {fields.map((f, i) => (
              <div key={f.key} className="rounded-[10px] border border-hairline bg-canvas p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-ink-tertiary">#{i + 1}</span>
                  <select
                    value={f.kind}
                    onChange={(e) => patchField(f.key, { kind: e.target.value as FormFieldKind })}
                    className="snap-select rounded-md border border-hairline bg-surface-1 px-2 py-1.5 text-xs text-ink-muted outline-none"
                  >
                    {kinds.map((k) => (
                      <option key={k} value={k}>{KIND_LABELS[k]}</option>
                    ))}
                  </select>
                  <input
                    value={f.label}
                    onChange={(e) => patchField(f.key, { label: e.target.value })}
                    placeholder="Question"
                    className="min-w-40 flex-1 rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
                    <input type="checkbox" checked={f.required} onChange={(e) => patchField(f.key, { required: e.target.checked })} className="accent-[var(--primary)]" />
                    Required
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
                    <input type="checkbox" checked={f.half ?? false} onChange={(e) => patchField(f.key, { half: e.target.checked })} className="accent-[var(--primary)]" />
                    Half width
                  </label>
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => move(f.key, -1)}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
                    <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => move(f.key, 1)}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
                    <Button size="sm" variant="ghost" aria-label="Remove field" onClick={() => setFields((fs) => fs.filter((x) => x.key !== f.key))}><Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden /></Button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    value={f.id}
                    onChange={(e) => patchField(f.key, { id: e.target.value })}
                    placeholder="field id (f_name)"
                    className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 font-mono text-xs text-ink-muted outline-none focus:border-primary"
                  />
                  <input
                    value={f.help ?? ""}
                    onChange={(e) => patchField(f.key, { help: e.target.value })}
                    placeholder="Help text (optional)"
                    className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs text-ink-muted outline-none focus:border-primary"
                  />
                  {(f.kind === "select" || f.kind === "radio") && (
                    <input
                      value={(f.options ?? []).join("\n")}
                      onChange={(e) => patchField(f.key, { options: e.target.value.split("\n") })}
                      placeholder="One option per line"
                      className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs text-ink-muted outline-none focus:border-primary sm:col-span-2"
                    />
                  )}
                </div>
              </div>
            ))}
            {!fields.length && <p className="text-sm text-ink-subtle">No fields yet — add one above.</p>}
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-600">
            {error} {upsell && <UpgradeCta to="studio" />}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={() => save(false)} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" onClick={() => save(true)} disabled={busy}>Save & refresh preview</Button>
        </div>
      </div>

      <aside className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink">Live preview</h2>
          <span className="text-xs text-ink-tertiary">public renderer</span>
        </div>
        <iframe
          key={previewKey}
          src={`/api/studio/templates/${templateId}/preview`}
          title="Form preview"
          className="h-[640px] w-full rounded-[12px] border border-hairline bg-white"
        />
      </aside>
    </div>
  );
}
