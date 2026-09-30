"use client";

/* Emails card (WEB-253) — system-email copy overrides with a live
 * production-renderer preview, plus the saved-snippet (canned reply)
 * manager. Empty override = shipped default. */
import { useState } from "react";
import dynamic from "next/dynamic";
import { Pencil } from "lucide-react";

import { Button } from "@webcules/ui/components/button";

/* WEB-286: the WYSIWYG snippet editor ships lazily — photographers never
 * see raw HTML and Tiptap's JSON model makes tag soup impossible. */
const RichTextEditor = dynamic(() => import("@/components/rich-text-editor"), { ssr: false });

type Template = { key: string; label: string };
type Override = { subject?: string; intro?: string };
type Snippet = { id: string; name: string; subject: string | null; body: string };

export function EmailsCard({
  templates,
  initialOverrides,
  initialSnippets,
  snippetLimit,
}: {
  templates: Template[];
  initialOverrides: Record<string, Override>;
  initialSnippets: Snippet[];
  snippetLimit: number | null;
}) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [snippets, setSnippets] = useState(initialSnippets);
  const [newSnippet, setNewSnippet] = useState({ name: "", subject: "", body: "" });
  const [snippetStatus, setSnippetStatus] = useState<string | null>(null);
  /** Non-null = the form is editing that snippet (PATCH) instead of creating. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const current = overrides[key] ?? {};
  const set = (patch: Override) => setOverrides((o) => ({ ...o, [key]: { ...(o[key] ?? {}), ...patch } }));

  async function save() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/studio/email-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      setStatus(res.ok ? "Saved — new sends use your copy; blank fields keep the default." : "Couldn't save — try again.");
      if (res.ok) setPreviewKey((k) => k + 1);
    } catch {
      setStatus("Network error — try again.");
    }
    setBusy(false);
  }

  function startEdit(id: string) {
    const s = snippets.find((x) => x.id === id);
    if (!s) return;
    setEditingId(id);
    setNewSnippet({ name: s.name, subject: s.subject ?? "", body: s.body });
    setSnippetStatus(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setNewSnippet({ name: "", subject: "", body: "" });
    setSnippetStatus(null);
  }

  /** HTML bodies count as empty only when they have no visible text. */
  const snippetBodyEmpty = !newSnippet.body.replace(/<[^>]*>/g, "").trim();

  async function saveSnippet() {
    if (!newSnippet.name.trim() || snippetBodyEmpty) return;
    setSnippetStatus(null);
    const payload = {
      name: newSnippet.name.trim(),
      body: newSnippet.body.trim(),
      ...(newSnippet.subject.trim() ? { meta: { subject: newSnippet.subject.trim() } } : {}),
    };
    if (editingId) {
      const res = await fetch(`/api/studio/templates/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setSnippetStatus("Couldn't save the reply.");
        return;
      }
      const saved = { id: editingId, name: payload.name, subject: newSnippet.subject.trim() || null, body: newSnippet.body.trim() };
      setSnippets((s) => s.map((x) => (x.id === editingId ? saved : x)));
      cancelEdit();
      setSnippetStatus("Reply updated.");
      return;
    }
    const res = await fetch("/api/studio/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "email_snippet", ...payload }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; limit?: number };
    if (!res.ok || !body.id) {
      setSnippetStatus(body.error === "limit_reached" ? `Your plan includes ${body.limit ?? 5} replies — upgrade to Studio for unlimited.` : "Couldn't save the reply.");
      return;
    }
    setSnippets((s) => [...s, { id: body.id!, name: payload.name, subject: newSnippet.subject.trim() || null, body: newSnippet.body.trim() }]);
    setNewSnippet({ name: "", subject: "", body: "" });
    setSnippetStatus("Reply saved — insert it from a lead thread.");
  }

  async function deleteSnippet(id: string) {
    if (editingId === id) cancelEdit();
    setSnippets((s) => s.filter((x) => x.id !== id));
    await fetch(`/api/studio/templates/${id}`, { method: "DELETE" });
  }

  const input = "rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary";
  const label = "flex flex-col gap-1 text-xs text-ink-subtle";
  const atLimit = snippetLimit !== null && snippets.length >= snippetLimit;

  return (
    <section id="emails" className="scroll-mt-24 rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Emails</h2>
      <p className="mb-4 mt-1 text-xs text-ink-subtle">
        Automatic emails — your subject and opening line per system send; buttons, links and your branding always stay
        intact. Saved replies for lead threads live below.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          <label className={label}>
            Template
            <select value={key} onChange={(e) => setKey(e.target.value)} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink outline-none">
              {templates.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Subject override (blank = default)
            <input value={current.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} maxLength={120} placeholder="Default subject" className={input} />
          </label>
          <label className={label}>
            Opening line override (blank = default) — merge fields like {"{{studio_name}}"} and {"{{client_name}}"} work
            <textarea value={current.intro ?? ""} onChange={(e) => set({ intro: e.target.value })} maxLength={1000} className={`${input} min-h-24`} placeholder="Default opening line" />
          </label>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={busy} size="sm">{busy ? "Saving…" : "Save & refresh preview"}</Button>
            {status && <span className="text-xs text-ink-subtle">{status}</span>}
          </div>

          <div className="mt-4 border-t border-hairline pt-4">
            <h3 className="text-sm font-medium text-ink">Saved replies (canned emails)</h3>
            <p className="mb-2 mt-0.5 text-xs text-ink-subtle">
              Insert from any lead thread&apos;s reply box — merge fields resolve per client. Edit or add your own here.
            </p>
            <ul className="mb-2 flex flex-col divide-y divide-hairline">
              {snippets.map((s) => (
                <li key={s.id} className={`flex items-center gap-2 py-2 first:pt-0 ${editingId === s.id ? "rounded-md bg-surface-2 px-2" : ""}`}>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
                  {s.subject && <span className="hidden max-w-40 truncate text-xs text-ink-tertiary sm:block">{s.subject}</span>}
                  <Button size="sm" variant="ghost" aria-label={`Edit snippet ${s.name}`} title="Edit" onClick={() => startEdit(s.id)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Delete snippet" title="Delete" onClick={() => deleteSnippet(s.id)}>✕</Button>
                </li>
              ))}
              {snippets.length === 0 && <li className="py-1 text-xs text-ink-subtle">No snippets yet.</li>}
            </ul>
            {(editingId || !atLimit) && (
              <div className="flex flex-col gap-2">
                {editingId && (
                  <div className="flex items-center justify-between text-xs font-medium text-primary">
                    <span>Editing “{snippets.find((x) => x.id === editingId)?.name ?? "snippet"}”</span>
                    <button type="button" onClick={cancelEdit} className="font-medium text-ink-subtle hover:text-ink">
                      Cancel edit
                    </button>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={newSnippet.name} onChange={(e) => setNewSnippet((s) => ({ ...s, name: e.target.value }))} placeholder="Name (e.g. Pricing follow-up)" className={input} />
                  <input value={newSnippet.subject} onChange={(e) => setNewSnippet((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject (optional)" className={input} />
                </div>
                <RichTextEditor
                  value={newSnippet.body}
                  onChange={(html) => setNewSnippet((s) => ({ ...s, body: html }))}
                  placeholder="Reply text — merge fields like {{client_name}} work"
                />
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="outline" onClick={saveSnippet} disabled={!newSnippet.name.trim() || snippetBodyEmpty}>
                    {editingId ? "Save changes" : "Save reply"}
                  </Button>
                  {snippetStatus && <span className="text-xs text-ink-subtle">{snippetStatus}</span>}
                </div>
              </div>
            )}
            {atLimit && !editingId && (
              <p className="text-xs text-ink-subtle">
                Your plan includes {snippetLimit} snippets — <a href="/dashboard/settings/billing" className="font-medium text-primary hover:underline">upgrade to Studio</a> for unlimited.
              </p>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Live preview</h3>
            <span className="text-xs text-ink-tertiary">production renderer</span>
          </div>
          <iframe
            key={`${key}-${previewKey}`}
            src={`/api/studio/email-overrides?preview=1&key=${encodeURIComponent(key)}`}
            title="Email preview"
            className="h-[520px] w-full rounded-[12px] border border-hairline bg-white"
          />
        </aside>
      </div>
    </section>
  );
}
