"use client";

/* Arrange photos on a SENT gallery (all plans). A thin host around the shared
 * <PhotoArranger>. Sorting and dragging are purely local; the arrangement is
 * saved ONCE when the photographer presses "Save & close" (PUT
 * /api/grants/{id}/order), which writes only the photos that moved. So a
 * 1,500-photo wedding costs one save, not one write per drag. The client sees
 * the new order on their next load - nothing to re-send. The same arranger
 * runs in the Files-tab Share panel before sending. */

import { useCallback, useEffect, useRef, useState } from "react";

import { ArrangeWorkspace } from "@/components/arrange-workspace";
import { PhotoArranger } from "@/components/photo-arranger";
import { ensureSortMeta, type ArrangeItem } from "@/lib/arrange-client";
import { orderedIdsForSort, type OrderMode } from "@/lib/gallery-order";

type Loaded = { items: ArrangeItem[]; orderMode: OrderMode; projectId: string };

type AssetsPayload = {
  orderMode: OrderMode;
  projectId: string;
  assets: { id: string; filename: string; kind: string; folder: string | null; colorKey: number | null; capturedAt: number | null; createdAtSec: number }[];
};

function toLoaded(body: AssetsPayload): Loaded {
  return {
    orderMode: body.orderMode,
    projectId: body.projectId,
    items: body.assets.map((a) => ({
      id: a.id,
      filename: a.filename,
      kind: a.kind,
      folder: a.folder,
      colorKey: a.colorKey,
      capturedAtSec: a.capturedAt,
      createdAtSec: a.createdAtSec,
    })),
  };
}

export function GalleryArrange({
  grantId,
  clientEmail,
  open,
  onOpenChange,
  onChanged,
}: {
  grantId: string | null;
  clientEmail?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved order (so the caller's grid stays in step). */
  onChanged?: (grantId: string, order: string[]) => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The latest arrangement - what Done saves. */
  const pending = useRef<{ order: string[]; mode: OrderMode } | null>(null);

  useEffect(() => {
    if (!open || !grantId) return;
    let cancelled = false;
    setData(null);
    setError("");
    setDirty(false);
    pending.current = null;
    fetch(`/api/grants/${grantId}/assets`)
      .then(async (res) => {
        if (!res.ok) throw new Error("load");
        const body = (await res.json()) as AssetsPayload;
        if (!cancelled) setData(toLoaded(body));
      })
      .catch(() => !cancelled && setError("Couldn't load this gallery - close and try again."));
    return () => {
      cancelled = true;
    };
  }, [open, grantId]);

  // Don't let a closing tab silently throw an arrangement away.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Sort in the browser. Date-taken / color first make sure those facts exist
   * (one-time writes per photo), then we re-read them and order locally. */
  const sortLocally = useCallback(
    async (mode: Parameters<typeof orderedIdsForSort>[1], setStatus: (m: string) => void, currentOrder: string[]) => {
      if (!grantId || !data) return null;
      await ensureSortMeta(data.projectId, mode, new Set(currentOrder), setStatus);
      const res = await fetch(`/api/grants/${grantId}/assets`);
      if (!res.ok) return null;
      const fresh = toLoaded((await res.json()) as AssetsPayload);
      const byId = new Map(fresh.items.map((i) => [i.id, i]));
      const current = currentOrder.map((id) => byId.get(id)).filter((i): i is ArrangeItem => Boolean(i));
      return { order: orderedIdsForSort(current, mode, Math.floor(Math.random() * 2 ** 31)) };
    },
    [grantId, data],
  );

  async function saveAndClose() {
    if (!dirty || !pending.current || !grantId) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/grants/${grantId}/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: pending.current.order, mode: pending.current.mode }),
      });
      if (!res.ok) throw new Error("save");
      onChanged?.(grantId, pending.current.order);
      setDirty(false);
      onOpenChange(false);
    } catch {
      setError("Couldn't save the new order - your changes are still here, try again.");
    }
    setSaving(false);
  }

  return (
    <ArrangeWorkspace
      open={open}
      title="Arrange photos"
      subtitle={`${clientEmail ? `${clientEmail} · ` : ""}${dirty ? "Unsaved changes - press Save & close to apply them to the gallery." : "Drag, sort, then press Done - your client sees the new order next time they open the link."}`}
      onClose={() => void saveAndClose()}
      doneLabel={dirty ? "Save & close" : "Done"}
      busy={saving}
      onCancel={dirty ? () => onOpenChange(false) : undefined}
    >
      {error && <p className="mb-2 text-sm text-destructive" role="alert">{error}</p>}
      {!data ? (
        <p className="py-10 text-center text-sm text-ink-subtle">{error ? "" : "Loading photos..."}</p>
      ) : (
        <PhotoArranger
          className="flex-1"
          items={data.items}
          mode={data.orderMode}
          onSort={sortLocally}
          onOrderChange={(order, mode) => {
            pending.current = { order, mode };
            setDirty(true);
          }}
        />
      )}
    </ArrangeWorkspace>
  );
}
