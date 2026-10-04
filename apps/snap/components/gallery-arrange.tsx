"use client";

/* Arrange photos on a SENT gallery (all plans). A thin host around the shared
 * <PhotoArranger>: every move and sort is saved to the gallery immediately
 * (PUT /api/grants/{id}/order), so the client sees the new order on their next
 * load - nothing to re-send. The same arranger runs in the Files-tab Share
 * panel before sending. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrangeWorkspace } from "@/components/arrange-workspace";
import { PhotoArranger } from "@/components/photo-arranger";
import { ensureSortMeta, type ArrangeItem } from "@/lib/arrange-client";
import type { OrderMode } from "@/lib/gallery-order";

type Loaded = { items: ArrangeItem[]; orderMode: OrderMode; projectId: string };

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
  /** Called with the new order after every change (so the caller's grid stays in step). */
  onChanged?: (grantId: string, order: string[]) => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !grantId) return;
    let cancelled = false;
    setData(null);
    setError("");
    fetch(`/api/grants/${grantId}/assets`)
      .then(async (res) => {
        if (!res.ok) throw new Error("load");
        const body = (await res.json()) as {
          orderMode: OrderMode;
          projectId: string;
          assets: { id: string; filename: string; kind: string; folder: string | null; colorKey: number | null; capturedAt: number | null; createdAtSec: number }[];
        };
        if (cancelled) return;
        setData({
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
        });
      })
      .catch(() => !cancelled && setError("Couldn't load this gallery - close and try again."));
    return () => {
      cancelled = true;
    };
  }, [open, grantId]);

  const put = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!grantId) return null;
      try {
        const res = await fetch(`/api/grants/${grantId}/order`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return res.ok ? ((await res.json()) as { order: string[] }) : null;
      } catch {
        return null;
      }
    },
    [grantId],
  );

  const ids = useMemo(() => new Set((data?.items ?? []).map((i) => i.id)), [data]);

  return (
    <ArrangeWorkspace
      open={open}
      title="Arrange photos"
      subtitle={`${clientEmail ? `${clientEmail} · ` : ""}Changes are live - your client sees the new order next time they open the link.`}
      onClose={() => onOpenChange(false)}
    >
      {error ? (
        <p className="py-10 text-center text-sm text-ink-subtle">{error}</p>
      ) : !data ? (
        <p className="py-10 text-center text-sm text-ink-subtle">Loading photos...</p>
      ) : (
        <PhotoArranger
          className="flex-1"
          items={data.items}
          mode={data.orderMode}
          onMove={async (moving, beforeId) => {
            const result = await put({ op: "move", ids: moving, beforeId });
            if (result && grantId) onChanged?.(grantId, result.order);
            return Boolean(result);
          }}
          onSort={async (mode, setStatus) => {
            await ensureSortMeta(data.projectId, mode, ids, setStatus);
            const result = await put({ op: "sort", mode, seed: Math.floor(Math.random() * 2 ** 31) });
            if (result && grantId) onChanged?.(grantId, result.order);
            return result;
          }}
        />
      )}
    </ArrangeWorkspace>
  );
}
