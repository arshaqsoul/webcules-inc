"use client";

/* Contract-template list interactions (WEB-251). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Star, Trash2 } from "lucide-react";

import { Button } from "@webcules/ui/components/button";

/** limit null = unlimited (Studio/Pro) — only the capped tiers pass a number. */
export function CreateContractTemplate({ disabled, limit, blankBody }: { disabled: boolean; limit: number | null; blankBody: string }) {
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
        body: JSON.stringify({ kind: "contract", name: name.trim(), body: blankBody }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        if (body.error === "limit_reached") {
          setError(limit === null ? "Couldn't create the template — try again." : `Your plan includes ${limit} contract templates — upgrade to Studio for unlimited.`);
        } else {
          setError("Couldn't create the template — try again.");
        }
        return;
      }
      router.push(`/dashboard/templates/contracts?edit=${body.id}`);
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-ink-subtle">
          New from scratch
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wedding agreement 2027" className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary" />
        </label>
        <Button onClick={create} disabled={busy || !name.trim() || disabled}>{busy ? "Creating…" : "Create template"}</Button>
        {disabled && (
          <p className="text-xs text-ink-subtle">
            Limit reached — <a href="/dashboard/settings/billing" className="font-medium text-primary hover:underline">upgrade to Studio</a> for unlimited templates.
          </p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ContractTemplateActions({ id, isDefault }: { id: string; isDefault: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(act: "duplicate" | "default" | "archive") {
    if (busy) return;
    if (act === "archive" && !confirm("Archive this template? Contracts already created from it keep their text.")) return;
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
