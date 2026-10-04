"use client";

/* Dev-only host for <PhotoArranger> with synthetic photos (no auth, no DB,
 * no R2): lets us drive the real component in a browser - drag, live reflow,
 * sizes, sorts - exactly as the Share panel and the sent-gallery Arrange view
 * do. Gated in the page (local dev or SNAP_DEV_HARNESS=1). */
import { useMemo, useState } from "react";

import { ArrangeWorkspace } from "@/components/arrange-workspace";
import { PhotoArranger } from "@/components/photo-arranger";
import type { ArrangeItem } from "@/lib/arrange-client";
import { orderedIdsForSort, type OrderMode, type SortMode } from "@/lib/gallery-order";

function swatch(index: number, portrait: boolean, label: string): string {
  const w = portrait ? 300 : 450;
  const h = portrait ? 450 : 300;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='hsl(${(index * 47) % 360} 55% 52%)'/><text x='50%' y='56%' font-size='${Math.round(h / 3)}' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='700'>${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function ArrangeHarness({ count, withFolders, transformed }: { count: number; withFolders: boolean; transformed: boolean }) {
  const items = useMemo<ArrangeItem[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        filename: `IMG_${String(i + 1).padStart(4, "0")}.jpg`,
        kind: "image",
        folder: withFolders ? (i % 3 === 0 ? "Ceremony" : i % 3 === 1 ? "Reception" : "Portraits") : null,
        createdAtSec: 1_700_000_000 + i,
        capturedAtSec: null,
        colorKey: (i * 977) % 36000,
      })),
    [count, withFolders],
  );
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [lastOrder, setLastOrder] = useState<string[]>(items.map((i) => i.id));
  const labelOf = useMemo(() => new Map(items.map((i, n) => [i.id, String(n + 1)])), [items]);

  const body = (
    <PhotoArranger
      className="flex-1"
      items={items}
      mode={"upload_old" as OrderMode}
      thumbUrl={(id) => swatch(Number(labelOf.get(id)), Number(labelOf.get(id)) % 4 === 0, labelOf.get(id) ?? "")}
      onMove={async (ids, beforeId) => {
        await new Promise((r) => setTimeout(r, 120)); // pretend network
        setLog((l) => [...l.slice(-9), `move ${ids.map((i) => labelOf.get(i)).join(",")} before ${beforeId ? labelOf.get(beforeId) : "END"}`]);
        return true;
      }}
      onSort={async (mode: SortMode) => ({ order: orderedIdsForSort(items.filter((i) => lastOrder.includes(i.id)), mode, 7) })}
      onOrderChange={(order) => setLastOrder(order)}
    />
  );

  return (
    <div className="min-h-screen bg-canvas p-6 text-ink" style={transformed ? { transform: "translate(40px, 30px)" } : undefined}>
      <h1 className="text-lg font-semibold">Arrange harness</h1>
      <button type="button" data-testid="open" className="mt-3 rounded-md border border-hairline px-3 py-1.5 text-sm" onClick={() => setOpen(true)}>Open arranger</button>
      <pre data-testid="log" className="mt-4 whitespace-pre-wrap text-xs text-ink-subtle">{log.join("\n")}</pre>
      <pre data-testid="order" className="mt-2 whitespace-pre-wrap text-xs text-ink-subtle">{lastOrder.map((id) => labelOf.get(id)).join(" ")}</pre>
      <ArrangeWorkspace open={open} title="Arrange photos" subtitle="Dev harness - synthetic photos" onClose={() => setOpen(false)}>
        {body}
      </ArrangeWorkspace>
    </div>
  );
}
