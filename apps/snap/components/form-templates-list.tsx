"use client";

/* Form-template interactions (WEB-248) — create form + per-row actions
 * (duplicate, set-default, archive). Rows are server-rendered; these own
 * the fetch + refresh. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Star, Trash2 } from "lucide-react";

import { Button } from "@webcules/ui/components/button";

const STARTER_SCHEMA = JSON.stringify({
  v: 1,
  title: "Get in touch",
  intro: "Tell us about your shoot — we usually reply within a day.",
  fields: [
    { id: "f_name", kind: "text", label: "Name", required: true, half: true },
    { id: "f_email", kind: "email", label: "Email", required: true, half: true },
    { id: "f_phone", kind: "phone", label: "Phone", required: false, half: true },
    { id: "f_eventDate", kind: "date", label: "Event date", required: false, half: true },
    { id: "f_eventType", kind: "select", label: "What kind of shoot?", required: false, options: ["Wedding", "Engagement", "Family", "Portrait", "Event", "Commercial", "Other"] },
    { id: "f_message", kind: "textarea", label: "Tell us more", required: false },
  ],
});

export function CreateFormRow() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/studio/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "form", name: name.trim(), body: STARTER_SCHEMA }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; limit?: number; kind?: string };
      if (!res.ok || !body.id) {
        if (body.error === "limit_reached") {
          const what = body.kind === "questionnaire" ? "questionnaire" : "contact form";
          setError(
            (body.limit ?? 1) <= 1
              ? `Your plan includes 1 ${what} — the starter template already counts. Edit it, or upgrade for more.`
              : `Your plan includes ${body.limit} ${what}s — you're at the limit. Upgrade for more.`,
          );
          return;
        }
        setError("Couldn't create the form — try again.");
        return;
      }
      router.push(`/dashboard/templates/forms?edit=${body.id}`);
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-ink-subtle">
          New form
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wedding inquiry" className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
        </label>
        <Button onClick={create} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create form"}</Button>
      </div>
      {error && (
        <p className="text-sm text-red-600">
          {error}{" "}
          <a href="/dashboard/settings/billing" className="font-medium text-primary hover:underline">
            View plans
          </a>
        </p>
      )}
    </div>
  );
}

export function FormTemplateRowActions({ id, isDefault }: { id: string; isDefault: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(act: "duplicate" | "default" | "archive") {
    if (busy) return;
    if (act === "archive" && !confirm("Archive this form? Existing links keep working; you can restore it later.")) return;
    setBusy(true);
    await fetch(`/api/studio/templates/${id}`, {
      method: act === "archive" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(act === "archive" ? {} : { body: JSON.stringify({ action: act }) }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      {!isDefault && (
        <Button size="sm" variant="ghost" aria-label="Set as default" title="Set as default" onClick={() => run("default")} disabled={busy}>
          <Star className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
      <Button size="sm" variant="ghost" aria-label="Duplicate" title="Duplicate" onClick={() => run("duplicate")} disabled={busy}>
        <Copy className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button size="sm" variant="ghost" aria-label="Archive" title="Archive" onClick={() => run("archive")} disabled={busy}>
        <Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden />
      </Button>
    </div>
  );
}
