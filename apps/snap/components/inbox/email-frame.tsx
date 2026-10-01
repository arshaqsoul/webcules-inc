"use client";

/* Sandboxed email renderer (WEB-305) — third-party HTML NEVER touches the
 * app DOM: it renders inside an iframe whose srcdoc is built by
 * buildEmailSrcdoc (server-sanitized fragment + CSP meta, forced white
 * card). sandbox carries NO allow-scripts; scripts are dead by both the
 * sandbox and the CSP inside the srcdoc. allow-same-origin exists so the
 * parent can measure contentDocument height (auto-grow) — the frame
 * navigates to about:srcdoc only; it can never reach app routes. Remote
 * images stay withheld until the user clicks "load images" (parent
 * re-renders the srcdoc with data-src promoted). */
import { useCallback, useEffect, useRef, useState } from "react";

import { buildEmailSrcdoc } from "@/lib/inbox/srcdoc";

export function EmailFrame({
  html,
  title,
  className,
}: {
  /** Sanitized fragment (sanitizeEmailHtml output). */
  html: string;
  title: string;
  className?: string;
}) {
  const [loadImages, setLoadImages] = useState(false);
  const [remoteImages, setRemoteImages] = useState(false);
  const [height, setHeight] = useState(150);
  const ref = useRef<HTMLIFrameElement>(null);

  const srcdoc = buildEmailSrcdoc({ html, loadImages });
  // Remote images present = the sanitizer withheld at least one data-src.
  useEffect(() => {
    setRemoteImages(/ data-src=/i.test(html));
  }, [html]);

  const measure = useCallback(() => {
    try {
      const doc = ref.current?.contentDocument;
      const h = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
      if (h && h > 0) setHeight(Math.min(h + 16, 20000));
    } catch {
      /* cross-origin forfeits measuring; fixed height keeps it usable */
    }
  }, []);

  // Image loads change layout after onLoad — re-measure shortly after.
  useEffect(() => {
    if (!loadImages) return;
    const t = setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [loadImages, measure]);

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {remoteImages && !loadImages && (
        <button
          type="button"
          onClick={() => setLoadImages(true)}
          className="self-start rounded-md border border-hairline bg-surface-1 px-2.5 py-1 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Load remote images
        </button>
      )}
      <iframe
        ref={ref}
        title={title}
        srcDoc={srcdoc}
        onLoad={measure}
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        style={{ height }}
        className="w-full rounded-[12px] border border-hairline bg-white"
      />
    </div>
  );
}
