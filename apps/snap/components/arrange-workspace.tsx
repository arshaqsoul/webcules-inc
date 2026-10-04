"use client";

/* ArrangeWorkspace - the full-screen shell that hosts <PhotoArranger>. It is
 * NOT a Radix dialog on purpose: dialogs centre themselves with a CSS
 * transform, which re-anchors every `position: fixed` descendant (that is what
 * threw the drag ghost into the corner) and capped the window at ~500px wide.
 * This is a plain fixed layer over the whole viewport, so photos get the whole
 * screen. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@webcules/ui/components/button";

export function ArrangeWorkspace({
  open,
  title,
  subtitle,
  onClose,
  doneLabel = "Done",
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  doneLabel?: string;
  children: React.ReactNode;
}) {
  // Portals need `document`: render only after mount so server rendering is safe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[90] flex flex-col bg-canvas text-ink">
      <header className="flex items-center gap-3 border-b border-hairline px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="truncate text-xs text-ink-subtle">{subtitle}</p>}
        </div>
        <Button onClick={onClose}>{doneLabel}</Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">{children}</div>
    </div>,
    document.body,
  );
}
