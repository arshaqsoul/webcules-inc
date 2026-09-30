"use client";

/* WEB-276 CSV import — mapping UI with live preview, dry-run ("Validate
 * first"), commit, failure download, and 7-day undo. Parsing happens in the
 * browser via the shared pure lib; the server re-validates and commits.
 * Imported people are never emailed (import ≠ consent). */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@webcules/ui/components/button";

import {
  IMPORT_FIELDS,
  failureCsv,
  parseImportCsv,
  shapeRows,
  type ImportField,
  type Mapping,
  type RowError,
} from "@/lib/csv-import";

type Report = {
  batchId: string | null;
  dryRun: boolean;
  created: number;
  skipped: number;
  updated: number;
  errors: RowError[];
};

export function LeadsImport({ defaultKind = "leads" }: { defaultKind?: "clients" | "leads" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [kind, setKind] = useState<"clients" | "leads">(defaultKind);
  const [updateBlanks, setUpdateBlanks] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shaped = useMemo(() => (rows.length ? shapeRows(rows, mapping) : { shaped: [], errors: [] }), [rows, mapping]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setNotice(null);
    setReport(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    file.text().then((text) => {
      const parsed = parseImportCsv(text);
      if (!parsed.ok) {
        setError(parsed.error);
        setHeader([]);
        setRows([]);
        return;
      }
      setHeader(parsed.header);
      setRows(parsed.rows);
      setMapping(parsed.mapping);
    });
  }

  function setColumn(field: ImportField, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === "") delete next[field];
      else next[field] = Number(value);
      return next;
    });
  }

  async function submit(dryRun: boolean) {
    if (!shaped.shaped.length && !shaped.errors.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/studio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, dryRun, updateBlanks, mapping, rows }),
      });
      const body = (await res.json().catch(() => ({}))) as Report & { error?: string };
      setBusy(false);
      if (!res.ok) {
        setError(body.error === "rate_limited" ? "Too many imports in a row — wait a minute." : "Import failed — try again.");
        return;
      }
      setReport(body);
      if (!dryRun) {
        setNotice("Import complete.");
        router.refresh();
      }
    } catch {
      setBusy(false);
      setError("Network error — try again.");
    }
  }

  async function undo(batchId: string) {
    if (!window.confirm("Undo this import? Rows it created are removed — unless something (a reply, a project) already used them.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/studio/import/${batchId}/undo`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { removed?: number; kept?: number; error?: string };
      setBusy(false);
      if (!res.ok) {
        setError(body.error === "window_expired" ? "Undo window (7 days) has passed." : "Couldn't undo — try again.");
        return;
      }
      setNotice(`Undone — ${body.removed ?? 0} removed, ${body.kept ?? 0} kept (already in use).`);
      setReport(null);
      router.refresh();
    } catch {
      setBusy(false);
      setError("Network error — try again.");
    }
  }

  function downloadErrors() {
    if (!shaped.errors.length) return;
    const blob = new Blob([failureCsv(shaped.errors)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "import-failures.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Import CSV
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">Import clients or leads from CSV</h2>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close import">
            ✕
          </Button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
          Bring an existing list from another platform. Required: an <strong>email</strong> column (it&apos;s how
          duplicates are detected). Photos migrate separately — bulk-upload originals into a project&apos;s Files
          tab, then share the gallery.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="import-file" className="text-sm text-ink">CSV file (≤ 5 MB, ≤ 10,000 rows)</label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="text-sm text-ink-subtle file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-hairline"
            />
            {fileName && <p className="text-xs text-ink-tertiary">{fileName}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="import-kind" className="text-sm text-ink">Import as</label>
            <select
              id="import-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "clients" | "leads")}
              className="snap-select rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="leads">Leads — land in the pipeline (status: new)</option>
              <option value="clients">Clients — your client list</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-ink-subtle">
              <input type="checkbox" checked={updateBlanks} onChange={(e) => setUpdateBlanks(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Fill blanks on existing rows (never overwrites)
            </label>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {header.length > 0 && (
          <>
            <p className="mt-5 text-xs font-medium uppercase tracking-wide text-ink-subtle">Map columns</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {IMPORT_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-background px-3 py-2">
                  <span className="text-sm text-ink">
                    {f.label}
                    {f.required && <span className="ml-1 text-destructive">*</span>}
                  </span>
                  <select
                    value={mapping[f.key] === undefined ? "" : String(mapping[f.key])}
                    onChange={(e) => setColumn(f.key, e.target.value)}
                    className="snap-select max-w-45 rounded-md border border-input bg-canvas px-2 py-1 text-xs text-ink-muted"
                  >
                    <option value="">— skip —</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
              <span><strong className="text-success-text">{shaped.shaped.length}</strong> ready</span>
              <span><strong className="text-ink">{shaped.errors.length}</strong> problem rows</span>
              {mapping.eventDate !== undefined && <span>Dates read as M/D/YYYY when ambiguous</span>}
              {shaped.errors.length > 0 && (
                <button type="button" onClick={downloadErrors} className="text-primary hover:underline">
                  Download failures
                </button>
              )}
            </div>
            {shaped.shaped.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-hairline">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-ink-subtle">
                    <tr>
                      <th className="px-2 py-1.5">Email</th>
                      <th className="px-2 py-1.5">Name</th>
                      <th className="px-2 py-1.5">Event date</th>
                      <th className="px-2 py-1.5">First row</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shaped.shaped.slice(0, 5).map((r) => (
                      <tr key={r.email} className="border-t border-hairline">
                        <td className="px-2 py-1.5 text-ink">{r.email}</td>
                        <td className="px-2 py-1.5 text-ink-subtle">{r.name ?? "—"}</td>
                        <td className="px-2 py-1.5 text-ink-subtle">{r.eventDate ?? "—"}</td>
                        <td className="px-2 py-1.5 text-ink-subtle">#{r.row}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={busy || mapping.email === undefined} onClick={() => submit(true)}>
                Validate first
              </Button>
              <Button size="sm" disabled={busy || mapping.email === undefined} onClick={() => submit(false)}>
                {busy ? "Working…" : `Import ${shaped.shaped.length} row${shaped.shaped.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </>
        )}

        {report && (
          <div className="mt-4 rounded-lg border border-hairline bg-background p-3 text-sm">
            <p className="font-medium text-ink">{report.dryRun ? "Dry run — nothing imported yet" : "Import result"}</p>
            <p className="mt-1 text-ink-subtle">
              {report.created} would be created / created · {report.skipped} skipped (already exist)
              {report.updated > 0 ? ` · ${report.updated} blanks filled` : ""}
              {report.errors.length ? ` · ${report.errors.length} problem rows (download above after closing this)` : ""}
            </p>
            {!report.dryRun && report.batchId && (
              <div className="mt-2 flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => undo(report.batchId!)}>
                  Undo this import
                </Button>
                <span className="text-xs text-ink-tertiary">Available for 7 days</span>
              </div>
            )}
          </div>
        )}
        {notice && <p className="mt-2 text-sm text-success">{notice}</p>}
      </section>
    </div>
  );
}
