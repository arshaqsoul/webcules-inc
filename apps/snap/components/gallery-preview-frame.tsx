"use client";

/* WEB-301 preview chrome — clearly OUTSIDE the client experience: a slim
 * banner (what this is + jump to sending) and a desktop/mobile viewport
 * toggle that frames the real gallery in a phone shell for full-page
 * mobile checking (same pattern as the style editor's dual preview). */
import { useState } from "react";

export function GalleryPreviewFrame({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [mobile, setMobile] = useState(false);

  return (
    <div className="min-h-screen bg-[#0c0c0f]">
      {/* Preview banner — styled against the dashboard dark, never the
       * client gallery's own theme, so it can't be mistaken for gallery UI. */}
      <div className="sticky top-0 z-50 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-white/10 bg-[#17171c] px-4 py-1.5 text-white">
        <p className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-[#5e6ad2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Preview</span>
          <span className="text-white/70">What your client will see — nothing is sent, views don&apos;t count.</span>
        </p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/15 p-0.5" role="group" aria-label="Preview viewport">
            <button
              type="button"
              onClick={() => setMobile(false)}
              aria-pressed={!mobile}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${!mobile ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setMobile(true)}
              aria-pressed={mobile}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${mobile ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              Mobile
            </button>
          </div>
          <a
            href={`/dashboard/projects/${projectId}?tab=gallery`}
            className="rounded-full bg-[#5e6ad2] px-3 py-1.5 text-[11px] font-semibold text-white transition-[filter] hover:brightness-110"
          >
            Send gallery →
          </a>
        </div>
      </div>

      {mobile ? (
        <div className="flex justify-center px-4 py-6">
          {/* phone shell — the gallery keeps its live theme inside */}
          <div data-preview-phone className="w-full max-w-[420px] overflow-hidden rounded-[28px] border-[10px] border-[#26262e] bg-black shadow-2xl">
            {children}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
