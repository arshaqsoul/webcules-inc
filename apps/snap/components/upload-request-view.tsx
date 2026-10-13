"use client";

/* Guest uploader for client-upload links (WEB-182). Same direct-to-R2
 * pipeline the studio Files tab uses — mint a presigned session, PUT the
 * bytes straight to storage, confirm — behind the link token. The uploader
 * name is optional free text, remembered locally so a guest sharing many
 * phone photos doesn't retype it. */
import { useCallback, useMemo, useRef, useState } from "react";

import { EXT_KIND } from "@/lib/upload-kinds";

type Item = {
  id: string;
  file: File;
  status: "waiting" | "uploading" | "done" | "failed";
  progress: number;
  error?: string;
};

const ACCEPT = "." + [...Object.keys(EXT_KIND)].join(",.");

function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag") ?? "")
        : reject(new Error(`PUT ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

export function UploadRequestView({
  token,
  accent,
  maxBytes,
  remaining,
  studioName,
}: {
  token: string;
  accent: string;
  maxBytes: number;
  remaining: number;
  studioName: string;
}) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState(remaining);
  const inputRef = useRef<HTMLInputElement>(null);

  const doneCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const allSettled =
    items.length > 0 && doneCount + failedCount === items.length;

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      setItems((prev) => {
        const next = [...prev];
        for (const file of Array.from(files)) {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          let error: string | undefined;
          if (!EXT_KIND[ext]) error = "Snap doesn't accept this file type";
          else if (file.size > maxBytes)
            error = "File is larger than the 1 GB guest limit";
          else if (
            slots - next.filter((i) => i.status !== "failed").length <=
            0
          )
            error = "This link's upload limit is reached";
          next.push({
            id: crypto.randomUUID(),
            file,
            status: error ? "failed" : "waiting",
            progress: 0,
            error,
          });
        }
        return next;
      });
    },
    [maxBytes, slots],
  );

  const uploadOne = useCallback(
    async (item: Item) => {
      const patch = (p: Partial<Item>) =>
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, ...p } : i)),
        );
      patch({ status: "uploading", progress: 0 });
      try {
        const mintRes = await fetch(`/api/u/${token}/uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: item.file.name,
            bytes: item.file.size,
            mimeType: item.file.type || "application/octet-stream",
          }),
        });
        const mint = (await mintRes.json()) as {
          assetId: string;
          mode: "single" | "multipart";
          url?: string;
          headers?: Record<string, string>;
          partUrls?: string[];
          partSize?: number;
          error?: string;
        };
        if (!mintRes.ok) throw new Error(mint.error ?? "upload_refused");

        if (mint.mode === "single" && mint.url) {
          await putWithProgress(mint.url, item.file, mint.headers ?? {}, (f) =>
            patch({ progress: f }),
          );
        } else if (mint.partUrls?.length) {
          const partSize =
            mint.partSize ?? Math.ceil(item.file.size / mint.partUrls.length);
          const etags: string[] = [];
          for (let p = 0; p < mint.partUrls.length; p++) {
            const slice = item.file.slice(
              p * partSize,
              Math.min((p + 1) * partSize, item.file.size),
            );
            const etag = await putWithProgress(
              mint.partUrls[p],
              slice,
              {},
              (f) => patch({ progress: (p + f) / mint.partUrls!.length }),
            );
            etags.push(etag.replace(/^"|"$/g, ""));
          }
          const confirmRes = await fetch(`/api/u/${token}/uploads/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetId: mint.assetId,
              etags,
              uploaderName: name || undefined,
            }),
          });
          if (!confirmRes.ok) throw new Error("confirm_failed");
        } else {
          const confirmRes = await fetch(`/api/u/${token}/uploads/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetId: mint.assetId,
              uploaderName: name || undefined,
            }),
          });
          if (!confirmRes.ok) throw new Error("confirm_failed");
        }
        patch({ status: "done", progress: 1 });
        setSlots((s) => Math.max(0, s - 1));
      } catch (err) {
        patch({
          status: "failed",
          error: String(err instanceof Error ? err.message : err),
        });
      }
    },
    [name, token],
  );

  const startUpload = useCallback(async () => {
    setBusy(true);
    try {
      if (typeof window !== "undefined" && name.trim())
        window.localStorage.setItem("snap-upload-name", name.trim());
      for (const item of items) {
        if (item.status === "waiting") await uploadOne(item);
      }
    } finally {
      setBusy(false);
    }
  }, [items, name, uploadOne]);

  const waiting = useMemo(
    () => items.some((i) => i.status === "waiting"),
    [items],
  );

  return (
    <div className="px-6 py-6">
      <label
        className="block text-sm font-medium text-ink"
        htmlFor="uploader-name"
      >
        Your name{" "}
        <span className="font-normal text-ink-subtle">
          (optional — so the studio knows who shared)
        </span>
      </label>
      <input
        id="uploader-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder="e.g. Aunt Marie"
        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink-subtle"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="mt-4 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-hairline px-4 py-10 text-center transition-colors hover:border-ink-subtle"
        style={{ background: `${accent}08` }}
      >
        <span className="text-sm font-medium text-ink">
          Choose photos or videos
        </span>
        <span className="mt-1 text-xs text-ink-subtle">
          or drop them here — up to 1 GB each
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-hairline bg-surface px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-ink">{item.file.name}</span>
                <span
                  className={
                    item.status === "failed"
                      ? "text-xs text-[#c0271f]"
                      : "text-xs text-ink-subtle"
                  }
                >
                  {item.status === "done"
                    ? "Sent ✓"
                    : item.status === "failed"
                      ? (item.error ?? "Failed")
                      : item.status === "uploading"
                        ? `${Math.round(item.progress * 100)}%`
                        : "Waiting"}
                </span>
              </div>
              {item.status === "uploading" && (
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${item.progress * 100}%`,
                      background: accent,
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <button
          type="button"
          disabled={busy || !waiting}
          onClick={startUpload}
          className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy
            ? `Sending… ${doneCount}/${items.length}`
            : `Send ${items.filter((i) => i.status === "waiting").length} file${items.filter((i) => i.status === "waiting").length === 1 ? "" : "s"}`}
        </button>
      )}

      {allSettled && !busy && (
        <p className="mt-4 rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink">
          {failedCount === 0
            ? `Thank you! Your photos are with ${studioName} — they'll review them before adding them to the gallery.`
            : `${doneCount} sent${failedCount ? `, ${failedCount} failed — remove the failed files and try the rest again` : ""}.`}
        </p>
      )}
    </div>
  );
}
