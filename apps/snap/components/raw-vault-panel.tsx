"use client";

/* RAW Vault dashboard (WEB-153) — hot vs cold breakdown per project and the
 * restore / keep-hot action (S3 class move back to Standard + a fresh
 * 6-month window). Server renders the initial summary; actions refetch. */
import { useState } from "react";
import Link from "next/link";

import { Button } from "@webcules/ui/components/button";

type VaultProjectRow = {
  projectId: string;
  title: string;
  hotCount: number;
  hotBytes: number;
  archivedCount: number;
  archivedBytes: number;
  nextAt: number | null;
  nextEvent: "notice" | "archive" | "purge" | null;
};

export type VaultSummary = {
  projects: VaultProjectRow[];
  totals: { hotCount: number; hotBytes: number; archivedCount: number; archivedBytes: number };
  nextPurgeAt: number | null;
};

type RestoreResult = {
  restored: number;
  extended: number;
  skipped: number;
  failures: { id: string; filename: string; error: string }[];
};

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}
function on(ts: number | null): string {
  return ts ? new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

const EVENT_COPY: Record<NonNullable<VaultProjectRow["nextEvent"]>, string> = {
  notice: "Hot until",
  archive: "Archives on",
  purge: "Deletes on",
};

export function RawVaultPanel({ initial }: { initial: VaultSummary }) {
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function act(scope: { projectId?: string; all?: boolean }, key: string) {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch("/api/studio/raw-vault/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope),
      });
      const data = (await res.json()) as { error?: string } & Partial<RestoreResult>;
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const parts = [
        data.restored ? `${data.restored} restored to hot storage` : null,
        data.extended ? `${data.extended} kept hot for 6 more months` : null,
      ].filter(Boolean);
      setMessage(parts.length ? parts.join(", ") + "." : "No RAW files in scope.");
      const refreshed = (await fetch("/api/studio/raw-vault").then((r) => r.json())) as VaultSummary;
      if (refreshed.projects) setSummary(refreshed);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const { totals, projects, nextPurgeAt } = summary;
  const hasRaw = totals.hotCount + totals.archivedCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Hot storage</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {totals.hotCount} <span className="text-sm font-normal text-ink-subtle">files · {gb(totals.hotBytes)}</span>
          </p>
          <p className="mt-1 text-xs text-ink-subtle">Instantly available for galleries and downloads.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Cold storage</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {totals.archivedCount} <span className="text-sm font-normal text-ink-subtle">files · {gb(totals.archivedBytes)}</span>
          </p>
          <p className="mt-1 text-xs text-ink-subtle">Downloadable anytime; one click restores them.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Next deletion</p>
          <p className="mt-1 text-xl font-semibold text-ink">{nextPurgeAt ? on(nextPurgeAt) : "None scheduled"}</p>
          <p className="mt-1 text-xs text-ink-subtle">Only after two emailed warnings. Restoring stops the clock.</p>
        </div>
      </div>

      {message && (
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink">{message}</p>
      )}

      {!hasRaw ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">No RAW files yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-subtle">
            When you upload RAWs (.cr2, .cr3, .nef, .arw, .dng, .rwl), this page tracks their 6-month hot window and
            cold-storage lifecycle.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Hot</th>
                <th className="px-4 py-2.5 font-medium">Cold</th>
                <th className="px-4 py-2.5 font-medium">Next</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/projects/${p.projectId}`} className="font-medium text-ink hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {p.hotCount} <span className="text-ink-subtle">· {gb(p.hotBytes)}</span>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {p.archivedCount > 0 ? (
                      <>
                        {p.archivedCount} <span className="text-ink-subtle">· {gb(p.archivedBytes)}</span>
                      </>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.nextAt && p.nextEvent ? (
                      <span className={p.nextEvent === "purge" ? "text-destructive" : "text-ink-subtle"}>
                        {EVENT_COPY[p.nextEvent]} {on(p.nextAt)}
                      </span>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => act({ projectId: p.projectId }, p.projectId)}
                    >
                      {busy === p.projectId
                        ? "Working…"
                        : p.archivedCount > 0
                          ? "Restore / keep hot"
                          : "Keep hot 6 more months"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totals.archivedCount > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-3">
              <p className="text-xs text-ink-subtle">
                {totals.archivedCount} files in cold storage across all projects.
              </p>
              <Button size="sm" disabled={busy !== null} onClick={() => act({ all: true }, "all")}>
                {busy === "all" ? "Restoring…" : "Restore everything"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
