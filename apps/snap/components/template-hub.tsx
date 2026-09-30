"use client";

/* Template hub (WEB-255) — one library for every designer artifact. Rows
 * are server-rendered; this component owns the actions: duplicate,
 * set-default, archive/restore, hard delete (usage-protected) and the
 * starter-restore banner. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RotateCcw, Star, Trash2 } from "lucide-react";

import { Button } from "@webcules/ui/components/button";

export type HubTemplate = {
  id: string;
  kind: string;
  name: string;
  isDefault: boolean;
  archived: boolean;
  updatedAt: string;
  lastUsedAt: string | null;
};

function usedLabel(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "used today";
  if (days === 1) return "used yesterday";
  if (days < 30) return `used ${days} days ago`;
  return `used ${Math.floor(days / 30)} mo ago`;
}

export function TemplateHubRows({
  templates,
  activeKind,
  editHref,
}: {
  templates: HubTemplate[];
  activeKind: string;
  /** WEB-286: section pages pass their own row link (e.g. "?edit={id}" on
   * the same page); the default map handles the legacy kinds. */
  editHref?: (t: HubTemplate) => string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(id: string, act: "duplicate" | "default" | "archive" | "restore" | "delete") {
    if (busy) return;
    if (act === "delete") {
      const t = templates.find((x) => x.id === id);
      if (!confirm(`Permanently delete "${t?.name}"? Templates in use can't be deleted — archive instead.`)) return;
    }
    setBusy(id);
    setError("");
    const res = await fetch(`/api/studio/templates/${id}`, {
      method: act === "archive" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(act === "archive" ? {} : { body: JSON.stringify({ action: act }) }),
    });
    if (!res.ok && act === "delete") {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error === "in_use" ? "This template has submissions — archive it instead (history keeps working)." : "Couldn't delete — try again.");
      setBusy(null);
      return;
    }
    setBusy(null);
    router.refresh();
  }

  if (templates.length === 0) {
    return <p className="text-sm text-ink-subtle">Nothing here yet.</p>;
  }
  void activeKind;

  return (
    <>
      <ul className="flex flex-col divide-y divide-hairline">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <a
                href={editHref ? editHref(t) : hubEditHref(t.kind, t.id)}
                className={`block truncate text-sm font-medium hover:text-primary ${t.archived ? "text-ink-subtle line-through" : "text-ink"}`}
              >
                {t.name}
              </a>
              <p className="text-xs text-ink-tertiary">
                {new Date(t.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {usedLabel(t.lastUsedAt) ? ` · ${usedLabel(t.lastUsedAt)}` : ""}
              </p>
            </div>
            {t.isDefault && !t.archived ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">default</span> : null}
            <div className="flex items-center gap-1">
              {!t.isDefault && !t.archived && (
                <Button size="sm" variant="ghost" aria-label="Set as default" title="Set as default" onClick={() => run(t.id, "default")} disabled={busy === t.id}>
                  <Star className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
              <Button size="sm" variant="ghost" aria-label="Duplicate" title="Duplicate" onClick={() => run(t.id, "duplicate")} disabled={busy === t.id}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
              {t.archived ? (
                <Button size="sm" variant="ghost" aria-label="Restore" title="Restore" onClick={() => run(t.id, "restore")} disabled={busy === t.id}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </Button>
              ) : (
                <Button size="sm" variant="ghost" aria-label="Archive" title="Archive" onClick={() => run(t.id, "archive")} disabled={busy === t.id}>
                  🗄️
                </Button>
              )}
              <Button size="sm" variant="ghost" aria-label="Delete" title="Delete permanently" onClick={() => run(t.id, "delete")} disabled={busy === t.id}>
                <Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );
}

export function RestoreStartersBanner({ missingCount }: { missingCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (missingCount === 0 && !note) return null;
  async function restore() {
    setBusy(true);
    const res = await fetch("/api/studio/templates/restore-starters", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { added?: number };
    setNote(res.ok ? `Restored ${body.added ?? 0} starter template(s).` : "Couldn't restore — try again.");
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-primary/30 bg-primary/5 p-4">
      <p className="flex-1 text-sm text-ink">
        {missingCount > 0
          ? `${missingCount} starter template${missingCount === 1 ? "" : "s"} missing from your library${note ? ` — ${note}` : "."}`
          : note ?? ""}
      </p>
      <Button size="sm" variant="outline" onClick={restore} disabled={busy}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {busy ? "Restoring…" : "Restore starters"}
      </Button>
    </div>
  );
}

function hubEditHref(kind: string, id: string): string {
  if (kind === "contract" || kind === "contract_clause") return `/dashboard/templates/contracts?edit=${id}`;
  if (kind === "form" || kind === "questionnaire") return `/dashboard/templates/forms?edit=${id}`;
  // WEB-286: every section page owns its rows now; this map only serves
  // stray cross-surface links.
  if (kind === "email_snippet") return "/dashboard/templates/emails";
  if (kind === "invoice_preset") return "/dashboard/templates/invoice-presets";
  if (kind === "gallery_preset") return "/dashboard/templates/gallery-styles";
  return "/dashboard/templates";
}
