"use client";

/* Share side panel (WEB-223) — deliver straight from the Files tab: pick the
 * recipient, the scope (everything approved, or specific folders), see the
 * exact image set about to ship (click through to the lightbox), and send.
 * Confirming creates + emails the gallery link and lands the user on the
 * Client gallery tab with the new link on top. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, X } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { MediaLightbox, type LightboxItem } from "@/components/media-lightbox";

type DeliverFolder = { id: string; name: string; count: number };
type PreviewAsset = { id: string; filename: string; kind: string };

const EXPIRY_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "60 days", value: "60" },
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
  { label: "No expiry", value: "" },
];

/** The deliverable set for a scope: approved + shared assets (the same rule
 * the gallery tab uses), merged from the two feed queries. */
async function fetchPreview(projectId: string, folderId: string | null): Promise<PreviewAsset[]> {
  const base = new URLSearchParams({ limit: "200" });
  if (folderId) base.set("folder", folderId);
  const [a, s] = await Promise.all(
    (["approved", "shared"] as const).map(async (status) => {
      const p = new URLSearchParams(base);
      p.set("status", status);
      try {
        const res = await fetch(`/api/projects/${projectId}/assets?${p}`);
        if (!res.ok) return [];
        const body = (await res.json()) as { items: PreviewAsset[] };
        return body.items ?? [];
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const out: PreviewAsset[] = [];
  for (const item of [...a, ...s]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function SharePanel({
  projectId,
  clientEmail,
  approvedCount,
  defaultExpiryDays = 90,
  defaultAllowDownload = true,
  onClose,
}: {
  projectId: string;
  clientEmail?: string;
  approvedCount: number;
  /** WEB-278: studio defaults from Settings → Delivery (0 = no expiry). */
  defaultExpiryDays?: number;
  defaultAllowDownload?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(clientEmail ?? "");
  const [days, setDays] = useState(defaultExpiryDays === 0 ? "" : String(defaultExpiryDays));
  const [allowDownload, setAllowDownload] = useState(defaultAllowDownload);
  const [proofing, setProofing] = useState(false);
  const [folders, setFolders] = useState<DeliverFolder[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewAsset[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    // Deliverable folder counts (approved/shared only) for the scope chips.
    fetch(`/api/projects/${projectId}/folders?deliverable=1`)
      .then((r) => r.json() as Promise<{ folders?: DeliverFolder[] }>)
      .then((b) => setFolders((b.folders ?? []).filter((f) => f.count > 0)))
      .catch(() => undefined);
  }, [projectId]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    const ids = Array.from(picked);
    const sets = await Promise.all(
      ids.length ? ids.map((id) => fetchPreview(projectId, id)) : [fetchPreview(projectId, null)],
    );
    const seen = new Set<string>();
    const merged: PreviewAsset[] = [];
    for (const item of sets.flat()) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    setPreviewTotal(merged.length);
    setPreview(merged);
    setLoading(false);
  }, [picked, projectId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const lightboxItems: LightboxItem[] = useMemo(
    () => preview.map((p) => ({ id: p.id, filename: p.filename, kind: p.kind })),
    [preview],
  );

  async function send() {
    if (sending) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError("Enter the client's email.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEmail: email.trim(),
          ...(picked.size ? { folderIds: Array.from(picked) } : {}),
          expiresInDays: days ? Number(days) : null,
          allowDownload,
          // WEB-242: proofing — downloads deliver watermarked previews.
          proofing,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (body.error === "gallery_limit") setError("Gallery limit reached for your plan — upgrade in Settings → Plan.");
        else if (body.error === "no_assets") setError("Nothing approved in that selection yet — approve files first.");
        else setError("Couldn't create the link — try again.");
        setSending(false);
        return;
      }
      onClose();
      router.push(`/dashboard/projects/${projectId}?tab=gallery`);
    } catch {
      setError("Network error — try again.");
    }
    setSending(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Share with client"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-hairline bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <h2 className="flex-1 text-sm font-semibold text-ink">Share with client</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close share panel">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <div className="border-b border-hairline bg-surface-2/60 px-4 py-1.5">
          <a
            href={`/g/${projectId}/preview`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-subtle underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            Not sure yet? Preview the gallery as your client will see it →
          </a>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <label className="flex flex-col gap-1 text-xs text-ink-subtle">
            Client email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          </label>

          <label className="mt-3 flex items-center gap-2 text-xs text-ink-subtle">
            Link expires
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="snap-select ml-auto rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted outline-none"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="mt-3 flex items-start gap-2 text-xs text-ink-subtle">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-xs font-medium text-ink">Allow downloads</span>
              <span className="block text-[11px] leading-relaxed text-ink-tertiary">
                Client can save the delivered photos.
              </span>
            </span>
          </label>

          {/* WEB-242: proofing mode — client downloads get the watermarked
           * preview (pre-sale delivery); re-share a clean gallery on purchase. */}
          <label className="mt-3 flex items-start gap-2 text-xs text-ink-subtle">
            <input
              type="checkbox"
              checked={proofing}
              onChange={(e) => setProofing(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-xs font-medium text-ink">Proofing gallery</span>
              <span className="block text-[11px] leading-relaxed text-ink-tertiary">
                Downloads deliver watermarked previews instead of originals — deliver clean files after purchase.
              </span>
            </span>
          </label>

          <div className="mt-4">
            <p className="text-xs font-medium text-ink">Deliver</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPicked(new Set())}
                aria-pressed={picked.size === 0}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${picked.size === 0 ? "bg-primary/10 text-primary" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"}`}
              >
                All approved · {approvedCount}
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    setPicked((cur) => {
                      const next = new Set(cur);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return next;
                    })
                  }
                  aria-pressed={picked.has(f.id)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${picked.has(f.id) ? "bg-primary/10 text-primary" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"}`}
                >
                  <Folder className="h-3 w-3" aria-hidden />
                  {f.name} · {f.count}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-ink">
              What gets sent{!loading && <span className="ml-1 font-normal text-ink-tertiary">{previewTotal} file{previewTotal === 1 ? "" : "s"}</span>}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-md bg-surface-2" />)
                : preview.slice(0, 60).map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLightbox(i)}
                      aria-label={`View ${p.filename}`}
                      className="group relative aspect-square overflow-hidden rounded-md border border-hairline bg-surface-1"
                    >
                      {p.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                        <img src={`/api/assets/${p.id}?variant=thumb`} alt={p.filename} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[9px] uppercase text-ink-tertiary">{p.kind}</span>
                      )}
                    </button>
                  ))}
            </div>
            {!loading && preview.length > 60 && (
              <button type="button" onClick={() => setLightbox(60)} className="mt-2 text-xs text-primary hover:underline">
                + {preview.length - 60} more — open viewer
              </button>
            )}
            {!loading && preview.length === 0 && (
              <p className="py-6 text-center text-xs text-ink-subtle">Nothing approved in this selection yet — approve files first.</p>
            )}
          </div>
        </div>

        <div className="border-t border-hairline p-4">
          {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={sending || loading || previewTotal === 0} onClick={() => void send()}>
            {sending ? "Sending…" : `Send link to ${previewTotal} file${previewTotal === 1 ? "" : "s"}`}
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-tertiary">The client verifies by email code; you can revoke or rotate any time.</p>
        </div>
      </aside>

      {lightbox !== null && (
        <MediaLightbox
          items={lightboxItems}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
