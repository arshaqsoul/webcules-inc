"use client";

/* Shared media lightbox (WEB-223) — fullscreen viewer with keyboard nav,
 * used by the Files share panel and the client-galleries "what was sent"
 * grid. Read-only: culling lives in the manage pane; this is for reviewing
 * a delivered set. */
import { useCallback, useEffect } from "react";

export type LightboxItem = { id: string; filename: string; kind: string };

export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const close = useCallback(() => onClose(), [onClose]);
  const step = useCallback(
    (dir: 1 | -1) => onIndexChange((index + dir + items.length) % items.length),
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, step]);

  const current = items[index];
  if (!current) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={current.filename} className="fixed inset-0 z-[90] flex flex-col bg-black/92" onClick={close}>
      <div className="flex items-center gap-3 px-4 py-3 text-white/90" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={close} aria-label="Close" className="rounded-md p-1.5 hover:bg-white/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm">
          {items.length > 1 ? `${index + 1} / ${items.length} · ` : ""}
          {current.filename}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={close}>
        {items.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); step(-1); }}
            aria-label="Previous"
            className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        {current.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
          <img src={`/api/assets/${current.id}?variant=preview`} alt={current.filename} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        ) : current.kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- internal review view
          <video key={current.id} src={`/api/assets/${current.id}`} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className="rounded-[12px] bg-white/5 p-10 text-center text-white/80" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm">{current.filename}</p>
            <p className="mt-1 text-xs text-white/50">{current.kind.toUpperCase()} file</p>
          </div>
        )}
        {items.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); step(1); }}
            aria-label="Next"
            className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
