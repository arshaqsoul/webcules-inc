"use client";

/* Linear-style image zoom: clicking any docs screenshot opens it full-screen
 * on a dark overlay; click anywhere or press Esc to close. Mounted once in
 * the docs layout — content modules (server components) stay untouched via
 * event delegation on the .docs-shot-img class. */
import { useEffect, useState } from "react";

export function DocsLightbox() {
  const [shot, setShot] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement | null)?.closest?.("img.docs-shot-img");
      if (img) {
        e.preventDefault();
        setShot({ src: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") ?? "" });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShot(null);
    };
    document.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!shot) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [shot]);

  if (!shot) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={shot.alt || "Screenshot zoom"}
      className="docs-lightbox fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-5 sm:p-10"
      onClick={() => setShot(null)}
    >
      <figure className="flex max-h-full max-w-[1440px] flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.src}
          alt={shot.alt}
          className="max-h-[86vh] max-w-full rounded-lg border border-white/10 object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </figure>
      <button
        type="button"
        aria-label="Close zoom view"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        onClick={() => setShot(null)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4.5 w-4.5" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
