"use client";
/* Portfolio collection view (WEB-346, screens 11 of the WEB-304 spec):
 * a responsive image grid with a keyboard-navigable lightbox. Images load
 * through the signed /api/pubimg links the server payload carries — there
 * is deliberately NO "view full size" affordance (web-size derivatives
 * only, WEB-304 §5). */
import { useCallback, useEffect, useState } from "react";

export type PortfolioLightboxItem = {
  assetId: string;
  image: string;
  caption: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export function PortfolioGrid({
  items,
  captions,
  radius,
}: {
  items: PortfolioLightboxItem[];
  captions: "off" | "hover" | "always";
  radius: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (dir: 1 | -1) =>
      setOpen((cur) => (cur === null ? cur : (cur + dir + items.length) % items.length)),
    [items.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step]);

  const current = open !== null ? items[open] : null;

  return (
    <>
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        style={{ ["--pf-radius" as string]: radius }}
      >
        {items.map((item, i) => (
          <button
            key={item.assetId}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative block w-full overflow-hidden bg-[var(--pf-surface)]"
            style={{ borderRadius: "var(--pf-radius)" }}
            aria-label={item.altText || item.caption || "Open photo"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image}
              alt={item.altText || item.caption || ""}
              loading="lazy"
              className="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {captions !== "off" && item.caption ? (
              <span
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left text-xs text-white ${
                  captions === "hover" ? "opacity-0 transition-opacity group-hover:opacity-100" : ""
                }`}
              >
                {item.caption}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.caption || "Photo"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
          >
            Esc
          </button>
          {items.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white hover:bg-white/20"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white hover:bg-white/20"
              >
                →
              </button>
            </>
          ) : null}
          <figure className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.image}
              alt={current.altText || current.caption || ""}
              className="max-h-[85vh] max-w-full object-contain"
            />
            {current.caption ? (
              <figcaption className="pt-2 text-center text-sm text-white/80">
                {current.caption}
              </figcaption>
            ) : null}
          </figure>
        </div>
      ) : null}
    </>
  );
}
