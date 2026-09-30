"use client";

/* Contract template editor (WEB-251) — a structured editor over the
 * contract body: slim rich toolbar (wraps the selection with allowlist
 * tags; saved bodies are sanitized server-side), the full merge-field
 * inserter, the studio's clause library at the cursor, and a live preview
 * iframe rendering the SAME document the signing page shows. Editing a
 * template never touches sent/signed contracts (bodies materialize at
 * creation). */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@webcules/ui/components/button";
import { MERGE_FIELDS } from "@/lib/merge-fields";

type Clause = { id: string; name: string; body: string };

export function ContractTemplateEditor({
  templateId,
  initialName,
  initialBody,
  clauses,
}: {
  templateId: string;
  initialName: string;
  initialBody: string;
  clauses: Clause[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = body.slice(start, end) || "text";
    setBody((b) => b.slice(0, start) + before + sel + after + b.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + sel.length;
    });
  }

  function insertAtCursor(text: string) {
    const el = ref.current;
    const at = el ? el.selectionStart : body.length;
    setBody((b) => b.slice(0, at) + text + b.slice(at ?? body.length));
  }

  async function save(preview: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled template", body }),
      });
      const rbody = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(rbody.error === "too_large" ? "That body is too large." : "Couldn't save — try again.");
        return;
      }
      if (preview) setPreviewKey((k) => k + 1);
      else router.refresh();
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  const btn = "rounded-md border border-hairline bg-surface-1 px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-2";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <label className="flex flex-col gap-1 text-xs text-ink-subtle">
            Template name
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
          </label>
          <p className="mt-2 text-xs text-ink-tertiary">
            Applying a template copies its text into the contract — editing here never changes contracts you already sent or that are signed.
          </p>
        </section>

        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={btn} onClick={() => wrap("<strong>", "</strong>")}><strong>B</strong></button>
            <button type="button" className={btn} onClick={() => wrap("<em>", "</em>")}><em>I</em></button>
            <button type="button" className={btn} onClick={() => wrap("<h3>", "</h3>")}>Heading</button>
            <button type="button" className={btn} onClick={() => wrap("<ul>\n<li>", "</li>\n</ul>")}>List</button>
            <button type="button" className={btn} onClick={() => wrap('<a href="https://', '">link</a>')}>Link</button>
            <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
            <select
              className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted outline-none"
              value=""
              onChange={(e) => e.target.value && insertAtCursor(`{{${e.target.value}}}`)}
              aria-label="Insert merge field"
            >
              <option value="">Insert field…</option>
              {MERGE_FIELDS.map((f) => (
                <option key={f.id} value={f.id}>{f.label} — {f.description}</option>
              ))}
            </select>
            <select
              className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted outline-none"
              value=""
              onChange={(e) => {
                const clause = clauses.find((c) => c.id === e.target.value);
                if (clause) insertAtCursor(`\n\n${clause.body}\n`);
              }}
              aria-label="Insert clause"
            >
              <option value="">Insert clause…</option>
              {clauses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-3 min-h-[420px] w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-primary"
            spellCheck
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => save(false)} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button variant="outline" onClick={() => save(true)} disabled={busy}>Save & refresh preview</Button>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink">Live preview</h2>
          <span className="text-xs text-ink-tertiary">signing page</span>
        </div>
        <iframe
          key={previewKey}
          src={`/api/studio/templates/${templateId}/preview`}
          title="Contract preview"
          className="h-[680px] w-full rounded-[12px] border border-hairline bg-white"
        />
      </aside>
    </div>
  );
}
