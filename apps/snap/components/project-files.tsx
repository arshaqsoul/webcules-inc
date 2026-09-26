"use client";

/* Project files — multi-file upload queue (sequential, retried per file),
 * asset grid with approve/reject/delete, counts by status. */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";

export type AssetItem = {
  id: string;
  filename: string;
  kind: string;
  status: string;
  bytes: number;
  createdAt: string;
};

type QueueItem = { name: string; size: number; state: "pending" | "uploading" | "done" | "failed" };

const STATUS_BADGE: Record<string, string> = {
  uploaded: "bg-surface-2 text-ink-subtle",
  approved: "bg-success/10 text-success-text",
  rejected: "bg-destructive/10 text-destructive",
  shared: "bg-primary/10 text-primary",
};

function mb(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ProjectFiles({ projectId, assets }: { projectId: string; assets: AssetItem[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    const items = Array.from(files).map((f) => ({ name: f.name, size: f.size, state: "pending" as const }));
    setQueue(items);
    let i = 0;
    for (const file of files) {
      setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, state: "uploading" } : item)));
      try {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch(`/api/projects/${projectId}/upload`, { method: "POST", body: form });
        setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, state: res.ok ? "done" : "failed" } : item)));
      } catch {
        setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, state: "failed" } : item)));
      }
      i++;
    }
    setUploading(false);
    router.refresh();
    setTimeout(() => setQueue([]), 4000);
  }

  async function act(assetId: string, action: "approve" | "reject" | "reset" | "delete") {
    if (action === "delete" && !confirm("Delete this file permanently?")) return;
    setBusy(assetId);
    const res =
      action === "delete"
        ? await fetch(`/api/assets/${assetId}`, { method: "DELETE" })
        : await fetch(`/api/assets/${assetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
    setBusy(null);
    if (!res.ok && action === "delete") {
      alert("This file is shared with a client and can't be deleted.");
    }
    router.refresh();
  }

  const counts = assets.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-hairline bg-surface-1 p-4">
        <div className="text-sm text-ink-subtle">
          {assets.length} file{assets.length === 1 ? "" : "s"}
          {counts.approved ? ` · ${counts.approved} approved` : ""}
          {counts.rejected ? ` · ${counts.rejected} rejected` : ""}
          {counts.shared ? ` · ${counts.shared} shared` : ""}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.avif,.heic,.gif,.mp4,.mov,.webm,.cr2,.cr3,.nef,.arw,.dng,.rwl"
          className="hidden"
          onChange={(e) => e.target.files?.length && uploadFiles(e.target.files)}
        />
        <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Uploading…" : "Upload files"}
        </Button>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
        className="rounded-[12px] border border-dashed border-hairline-strong bg-surface-1 p-6 text-center text-sm text-ink-subtle"
      >
        Drag & drop photos, videos, and RAWs here (up to 100 MB per file)
      </div>

      {queue.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[12px] border border-hairline bg-surface-1 p-3">
          {queue.map((q, i) => (
            <div key={i} className="flex items-center justify-between px-1 text-xs">
              <span className="truncate text-ink-muted">{q.name} ({mb(q.size)})</span>
              <span className={q.state === "done" ? "text-success-text" : q.state === "failed" ? "text-destructive" : "text-ink-subtle"}>
                {q.state === "uploading" ? "uploading…" : q.state}
              </span>
            </div>
          ))}
        </div>
      )}

      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((a) => (
            <div key={a.id} className="flex flex-col overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
              <a href={`/api/assets/${a.id}`} target="_blank" rel="noreferrer" className="block aspect-square bg-canvas">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                  <img src={`/api/assets/${a.id}`} alt={a.filename} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-tertiary">
                    <span className="text-xs uppercase">{a.kind}</span>
                    <span className="text-[10px]">{a.filename.split(".").pop()}</span>
                  </div>
                )}
              </a>
              <div className="flex flex-col gap-1.5 p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[a.status] ?? ""}`}>{a.status}</span>
                  <span className="text-[10px] text-ink-tertiary">{mb(a.bytes)}</span>
                </div>
                <p className="truncate text-[11px] text-ink-muted" title={a.filename}>{a.filename}</p>
                <div className="flex gap-1">
                  {a.status !== "approved" && a.status !== "shared" && (
                    <button disabled={busy === a.id} onClick={() => act(a.id, "approve")} className="flex-1 rounded-md bg-success/10 px-1.5 py-1 text-[10px] font-medium text-success-text hover:bg-success/20">Approve</button>
                  )}
                  {a.status !== "rejected" && a.status !== "shared" && (
                    <button disabled={busy === a.id} onClick={() => act(a.id, "reject")} className="flex-1 rounded-md bg-destructive/10 px-1.5 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/20">Reject</button>
                  )}
                  {a.status !== "shared" && (
                    <button disabled={busy === a.id} onClick={() => act(a.id, "delete")} aria-label="Delete" className="rounded-md px-1.5 py-1 text-[10px] text-ink-tertiary hover:text-destructive">✕</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
