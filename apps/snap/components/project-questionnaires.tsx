"use client";

/* Project questionnaires card (WEB-248) — apply a questionnaire template,
 * copy/email the tokenized client link, and read submitted answers inline. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Send } from "lucide-react";

import { Button } from "@webcules/ui/components/button";

export type QuestionnaireView = {
  id: string;
  templateName: string;
  status: "pending" | "submitted";
  submittedAt: string | null;
  clientEmail: string | null;
  answers: Array<{ label: string; value: string }>;
};

export function ProjectQuestionnaires({
  projectId,
  initial,
  templates,
  defaultClientEmail,
}: {
  projectId: string;
  initial: QuestionnaireView[];
  templates: Array<{ id: string; name: string }>;
  defaultClientEmail: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [email, setEmail] = useState(defaultClientEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ url: string; emailed: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function send() {
    if (busy || !templateId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/questionnaires`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, ...(email.trim() ? { clientEmail: email.trim() } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; emailed?: boolean; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error === "invalid_email" ? "That email doesn't look right." : "Couldn't create the link — try again.");
        return;
      }
      setFlash({ url: body.url, emailed: Boolean(body.emailed) });
      // Refresh the list from the server (source of truth).
      const listed = (await fetch(`/api/projects/${projectId}/questionnaires`).then((r) => r.json()).catch(() => null)) as { responses?: Array<{ id: string; submittedAt: string | null }> } | null;
      if (listed?.responses) {
        setItems(
          (listed.responses as Array<{ id: string; submittedAt: string | null }>).map((r) => ({
            id: r.id,
            templateName: templates.find((t) => t.id === templateId)?.name ?? "Questionnaire",
            status: r.submittedAt ? ("submitted" as const) : ("pending" as const),
            submittedAt: r.submittedAt,
            clientEmail: email || null,
            answers: [],
          })),
        );
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Questionnaires</h2>
      <p className="mb-3 mt-1 text-xs text-ink-subtle">Send a questionnaire; answers land here and on the lead-free project record.</p>

      {templates.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-subtle">
            Questionnaire
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink outline-none">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-subtle">
            Client email (optional)
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
          </label>
          <Button onClick={send} disabled={busy}>
            <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {busy ? "Sending…" : "Send link"}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {flash && (
        <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-primary/30 bg-primary/5 p-3">
          <p className="flex-1 text-xs text-ink-muted">{flash.emailed ? "Link emailed to the client." : "Link created (no email sent — copy it manually)."}</p>
          <code className="max-w-52 truncate rounded bg-surface-1 px-2 py-1 text-[11px] text-ink-muted">{flash.url}</code>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(flash.url)}>
            <Copy className="mr-1 h-3 w-3" aria-hidden /> Copy
          </Button>
        </div>
      )}

      <ul className="mt-3 flex flex-col divide-y divide-hairline">
        {items.length === 0 && <li className="py-2 text-sm text-ink-subtle">No questionnaires yet.</li>}
        {items.map((q) => (
          <li key={q.id} className="py-2.5 first:pt-1">
            <button
              type="button"
              onClick={() => setOpenId(openId === q.id ? null : q.id)}
              className="flex w-full items-center gap-2 text-left"
              aria-expanded={openId === q.id}
            >
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-tertiary transition-transform ${openId === q.id ? "rotate-0" : "-rotate-90"}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{q.templateName}</span>
              {q.status === "submitted" ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                  answered {q.submittedAt ? new Date(q.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </span>
              ) : (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-subtle">awaiting reply</span>
              )}
            </button>
            {openId === q.id && (
              <div className="mt-2 pl-5">
                {q.status === "submitted" ? (
                  q.answers.length ? (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      {q.answers.map((a, i) => (
                        <div key={i}>
                          <dt className="text-xs text-ink-tertiary">{a.label}</dt>
                          <dd className="whitespace-pre-wrap text-sm text-ink">{a.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-ink-subtle">Answers were submitted but are not loaded — refresh the page.</p>
                  )
                ) : (
                  <p className="text-sm text-ink-subtle">The client hasn't answered yet{q.clientEmail ? ` (sent to ${q.clientEmail})` : ""}.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
