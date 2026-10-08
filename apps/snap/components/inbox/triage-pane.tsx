"use client";

/* Triage pane (WEB-308) — a threadless item's detail: what we know about
 * the unmatched email + the one-click "attach to client/lead/project"
 * picker that joins it to (or starts) the right conversation. */
import { useEffect, useState } from "react";
import { Inbox, Search } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { ConnectClientDialog } from "@/components/inbox/connect-client-dialog";

type Option =
  | { kind: "lead"; id: string; label: string; sub: string; status: string }
  | { kind: "client"; id: string; label: string; sub: string }
  | { kind: "project"; id: string; label: string; status: string };

type OptionsPayload = {
  leads: Array<{ id: string; name: string; email: string; status: string }>;
  clients: Array<{ id: string; name: string | null; email: string }>;
  projects: Array<{ id: string; title: string; status: string }>;
};

export function TriagePane({
  item,
  onAttached,
  onDelete,
}: {
  item: { id: string; title: string; preview: string; kind: string; createdAt: string };
  onAttached: (threadId: string) => void;
  onDelete: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [options, setOptions] = useState<OptionsPayload>({ leads: [], clients: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // WEB-335: a project with no client asks for one instead of guessing.
  const [needClient, setNeedClient] = useState<{ recordId: string; title: string; email: string; name: string } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/inbox/attach-options?q=${encodeURIComponent(debounced)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<OptionsPayload>) : ({ leads: [], clients: [], projects: [] } as OptionsPayload)))
      .then((payload: OptionsPayload) => {
        if (live) {
          setOptions(payload);
          setLoading(false);
        }
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [debounced]);

  async function attach(
    kind: "lead" | "client" | "project",
    recordId: string,
    client?: { email: string; name: string },
  ) {
    if (attaching) return;
    setAttaching(recordId);
    setError(null);
    setClientError(null);
    try {
      const res = await fetch(`/api/inbox/items/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attach: true, kind, recordId, ...(client ? { client: { email: client.email, ...(client.name ? { name: client.name } : {}) } } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        threadId?: string;
        error?: string;
        suggested?: { email: string; name: string | null } | null;
      };
      if (res.status === 409 && body.error === "client_required") {
        const label = rows.find((r) => r.kind === kind && r.id === recordId)?.label ?? "this project";
        setNeedClient({ recordId, title: label, email: body.suggested?.email ?? "", name: body.suggested?.name ?? "" });
        return;
      }
      if (!res.ok || !body.threadId) throw new Error(body.error ?? "attach_failed");
      setNeedClient(null);
      onAttached(body.threadId);
    } catch (e) {
      const msg = String(e).includes("already_threaded") ? "Already attached to a conversation." : "Attach failed — try again.";
      if (client) setClientError(msg);
      else setError(msg);
    } finally {
      setAttaching(null);
    }
  }

  const rows: Option[] = [
    ...options.leads.map((l) => ({ kind: "lead" as const, id: l.id, label: l.name, sub: l.email, status: l.status })),
    ...options.clients.map((c) => ({ kind: "client" as const, id: c.id, label: c.name ?? c.email, sub: c.email })),
    ...options.projects.map((p) => ({ kind: "project" as const, id: p.id, label: p.title, status: p.status })),
  ];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="border-b border-hairline px-5 py-4">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Inbox className="h-4 w-4 text-primary" aria-hidden /> Needs triage
        </p>
        <h2 className="mt-1 text-[15px] font-medium text-ink">{item.title}</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-subtle">{item.preview || "(no preview)"}</p>
        <p className="mt-1 text-xs text-ink-tertiary">
          {new Date(item.createdAt).toLocaleString()} · {item.kind}
        </p>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm font-medium text-ink">Attach to a conversation</p>
        <p className="mt-0.5 text-xs text-ink-subtle">
          Match this email to a client, lead or project — it joins their thread and the history stays whole.
        </p>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients, leads, projects…"
            aria-label="Search records to attach"
            className="w-full rounded-md border border-hairline bg-canvas py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-tertiary"
          />
        </label>

        {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}

        <div className="mt-3 flex flex-col gap-1.5">
          {loading && <p className="text-sm text-ink-subtle">Loading…</p>}
          {!loading && rows.length === 0 && <p className="text-sm text-ink-subtle">No matching records.</p>}
          {rows.map((r) => (
            <button
              key={r.kind + r.id}
              type="button"
              disabled={attaching !== null}
              onClick={() => void attach(r.kind, r.id)}
              className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-1 px-3 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{r.label}</span>
                <span className="block truncate text-xs text-ink-tertiary">
                  {r.kind === "lead" ? "Lead" : r.kind === "client" ? "Client" : "Project"}
                  {"sub" in r ? ` · ${r.sub}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-tertiary">{"status" in r ? r.status : ""}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 border-t border-hairline pt-3">
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-ink-subtle">
            Not worth keeping — delete
          </Button>
        </div>
      </div>

      <ConnectClientDialog
        open={needClient !== null}
        onOpenChange={(v) => !v && setNeedClient(null)}
        projectTitle={needClient?.title}
        initialEmail={needClient?.email}
        initialName={needClient?.name}
        busy={attaching !== null}
        error={clientError}
        confirmLabel="Connect and attach"
        onSubmit={(c) => needClient && void attach("project", needClient.recordId, c)}
      />
    </div>
  );
}
