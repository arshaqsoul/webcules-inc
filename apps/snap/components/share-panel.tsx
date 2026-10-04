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
import { ArrangeWorkspace } from "@/components/arrange-workspace";
import { MediaLightbox, type LightboxItem } from "@/components/media-lightbox";
import { PhotoArranger } from "@/components/photo-arranger";
import { WelcomeCollage, type WelcomeValue } from "@/components/welcome-collage";
import { ensureSortMeta, fetchDeliverableItems, type ArrangeItem } from "@/lib/arrange-client";
import { SORT_LABELS, SORT_MODES, orderedIdsForSort, type OrderMode, type SortMode } from "@/lib/gallery-order";

type DeliverFolder = { id: string; name: string; count: number };

const EXPIRY_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "60 days", value: "60" },
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
  { label: "No expiry", value: "" },
];

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
  // Optional welcome collage (heads the email; gallery banner is opt-in).
  const [welcome, setWelcome] = useState<WelcomeValue>(null);
  const [welcomeBanner, setWelcomeBanner] = useState(false);
  const [proofing, setProofing] = useState(false);
  const [folders, setFolders] = useState<DeliverFolder[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The photos about to ship, in the order the client will see them.
  const [items, setItems] = useState<ArrangeItem[]>([]);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [orderMode, setOrderMode] = useState<OrderMode>("upload_old");
  const [orderStatus, setOrderStatus] = useState("");
  const [arrangeItems, setArrangeItems] = useState<ArrangeItem[] | null>(null);
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
    const fresh = await fetchDeliverableItems(projectId, folders, Array.from(picked));
    setItems(fresh);
    // A different scope is a different set of photos: start from the default order.
    setOrderIds(fresh.map((i) => i.id));
    setOrderMode("upload_old");
    setLoading(false);
  }, [picked, projectId, folders]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  /** The photos in the order they will be sent. */
  const ordered = useMemo(() => orderIds.map((id) => byId.get(id)).filter((i): i is ArrangeItem => Boolean(i)), [orderIds, byId]);
  const previewTotal = ordered.length;

  const lightboxItems: LightboxItem[] = useMemo(
    () => ordered.map((p) => ({ id: p.id, filename: p.filename, kind: p.kind })),
    [ordered],
  );

  /** Sort before sending: make sure the sort's metadata exists, then order locally. */
  const sortBeforeSend = useCallback(
    async (mode: SortMode, setStatus: (m: string) => void): Promise<{ order: string[] } | null> => {
      await ensureSortMeta(projectId, mode, new Set(orderIds), setStatus);
      // Re-read so freshly scanned capture dates / analysed colors are included,
      // then sort the CURRENT arrangement (folders keep their order).
      const fresh = await fetchDeliverableItems(projectId, folders, Array.from(picked));
      const freshById = new Map(fresh.map((i) => [i.id, i]));
      const current = orderIds.map((id) => freshById.get(id)).filter((i): i is ArrangeItem => Boolean(i));
      const order = orderedIdsForSort(current, mode, Math.floor(Math.random() * 2 ** 31));
      setItems(fresh);
      return { order };
    },
    [projectId, folders, picked, orderIds],
  );

  async function quickSort(mode: SortMode) {
    setOrderStatus("");
    const result = await sortBeforeSend(mode, setOrderStatus);
    if (result) {
      setOrderIds(result.order);
      setOrderMode(mode);
    } else {
      setOrderStatus("Couldn't sort - try again.");
    }
  }

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
          ...(welcome && !proofing ? { welcomeImageId: welcome.imageId, welcomeBanner } : {}),
          // WEB-242: proofing — downloads deliver watermarked previews.
          proofing,
          // Exactly the order shown here is the order the client gets.
          assetOrder: orderIds,
          orderMode,
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

          {proofing ? (
            <p className="mt-3 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-ink-tertiary">
              Proofing galleries can't have a welcome collage - it would put clean, unwatermarked photos in a public email.
            </p>
          ) : (
            <WelcomeCollage
              projectId={projectId}
              value={welcome}
              onChange={setWelcome}
              disabled={sending}
              inline
              banner={welcomeBanner}
              onBanner={setWelcomeBanner}
            />
          )}

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

          {/* Photo order: the order shown here is exactly what the client sees. */}
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-ink">
                What gets sent{!loading && <span className="ml-1 font-normal text-ink-tertiary">{previewTotal} file{previewTotal === 1 ? "" : "s"}</span>}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={loading || previewTotal < 2}
                onClick={() => setArrangeItems(ordered)}
              >
                Arrange photos
              </Button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-subtle">
              Photo order
              <select
                aria-label="Photo order"
                value={orderMode === "custom" ? "custom" : orderMode}
                disabled={loading || previewTotal < 2}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== "custom") void quickSort(v as SortMode);
                }}
                className="snap-select ml-auto rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted outline-none"
              >
                {orderMode === "custom" && <option value="custom">{SORT_LABELS.custom}</option>}
                {SORT_MODES.map((m) => (
                  <option key={m} value={m}>{SORT_LABELS[m]}</option>
                ))}
              </select>
            </label>
            {orderStatus && <p className="mt-1 text-[11px] text-ink-tertiary" aria-live="polite">{orderStatus}</p>}

            <div className="mt-2 grid grid-cols-3 gap-2">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-md bg-surface-2" />)
                : ordered.slice(0, 12).map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLightbox(i)}
                      aria-label={`View ${p.filename}`}
                      className="group relative aspect-[4/3] overflow-hidden rounded-md border border-hairline bg-surface-2"
                    >
                      {p.kind === "image" || p.kind === "video" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                        <img src={`/api/assets/${p.id}?variant=thumb`} alt={p.filename} loading="lazy" className="h-full w-full object-contain" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[9px] uppercase text-ink-tertiary">{p.kind}</span>
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[10px] leading-4 text-white">{i + 1}</span>
                    </button>
                  ))}
            </div>
            {!loading && ordered.length > 12 && (
              <button type="button" onClick={() => setArrangeItems(ordered)} className="mt-2 text-xs text-primary hover:underline">
                + {ordered.length - 12} more — arrange all {ordered.length} photos
              </button>
            )}
            {!loading && ordered.length === 0 && (
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

      <ArrangeWorkspace
        open={arrangeItems !== null}
        title="Arrange photos"
        subtitle="This is the order your client will see. Nothing is sent until you press Send."
        onClose={() => setArrangeItems(null)}
      >
        {arrangeItems && (
          <PhotoArranger
            className="flex-1"
            items={arrangeItems}
            mode={orderMode}
            onMove={async () => true /* nothing to persist yet - the order is kept in the panel */}
            onSort={sortBeforeSend}
            onOrderChange={(order, mode) => {
              setOrderIds(order);
              setOrderMode(mode);
            }}
          />
        )}
      </ArrangeWorkspace>

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
