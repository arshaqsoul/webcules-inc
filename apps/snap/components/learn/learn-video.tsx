"use client";
/* /learn player — Linear-style: full-width video, then the narration as
 * prose with a sticky chapter rail beside it. Clicking a chapter (or a
 * transcript paragraph) seeks the video; the rail tracks playback. */
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { fmt, type LearnChapter, type LearnLine } from "@/lib/learn/nav";

export function LearnVideo({
  src,
  poster,
  captions,
  chapters,
  transcript,
}: {
  src: string;
  poster?: string;
  captions?: string;
  chapters: LearnChapter[];
  transcript: LearnLine[];
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const params = useSearchParams();
  const [active, setActive] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);
  // The chapter/line the user picked: stays highlighted until playback
  // actually arrives there (deep seeks wait on a CDN Range response, which
  // not every host honors) or playback moves past it.
  const pin = useRef<{ chapter: number; line: number } | null>(null);

  // Deep link support: /learn/<slug>?t=<seconds> starts at that timestamp
  // (used by docs search chapter hits).
  useEffect(() => {
    const v = ref.current;
    const t0 = Number(params.get("t") ?? "");
    if (!v || !Number.isFinite(t0) || t0 <= 0) return;
    const apply = () => {
      v.currentTime = t0;
      void v.play().catch(() => {});
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener("loadedmetadata", apply, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Robust seek: applies once metadata is ready, re-applies on canplay in
  // case the initial assignment raced the loader, then plays. The rail and
  // transcript highlight update HERE, not only on timeupdate — the user gets
  // immediate feedback for the chapter they picked (deep seeks beyond the
  // buffered prefix depend on the CDN honoring Range, which not every host
  // does; the highlight must not).
  const seek = (start: number, chapterIdx?: number, lineIdx?: number) => {
    let a = 0;
    chapters.forEach((c, i) => {
      if (start >= c.start) a = i;
    });
    let l = -1;
    transcript.forEach((line, i) => {
      if (start >= line.start - 0.15) l = i;
    });
    pin.current = { chapter: chapterIdx ?? a, line: lineIdx ?? l };
    setActive(pin.current.chapter);
    setActiveLine(pin.current.line);
    const v = ref.current;
    if (!v) return;
    const apply = () => {
      if (Math.abs(v.currentTime - start) > 1) v.currentTime = start;
      void v.play().catch(() => {});
    };
    if (v.readyState >= 1) {
      v.currentTime = start;
      void v.play().catch(() => {});
      return;
    }
    v.addEventListener("loadedmetadata", apply, { once: true });
    v.addEventListener("canplay", apply, { once: true });
    v.preload = "auto";
    v.load();
  };

  const onTime = () => {
    const v = ref.current;
    if (!v) return;
    const t = v.currentTime;
    let a = 0;
    chapters.forEach((c, i) => {
      if (t >= c.start) a = i;
    });
    let l = -1;
    transcript.forEach((line, i) => {
      if (t >= line.start - 0.15) l = i;
    });
    const p = pin.current;
    if (p && (t >= chapters[p.chapter].start - 0.3 || a > p.chapter)) {
      // Playback arrived at (or passed) the picked chapter — follow playback.
      pin.current = null;
      setActive(a);
      setActiveLine(l);
      return;
    }
    setActive(p ? p.chapter : a);
    setActiveLine(p ? p.line : l);
  };

  return (
    <div>
      <div className="overflow-hidden rounded-[12px] border border-hairline bg-black">
        <video
          ref={ref}
          src={src}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={onTime}
          className="block aspect-video w-full"
          style={{ accentColor: "var(--primary)" }}
        >
          {captions ? <track kind="captions" src={captions} srcLang="en" label="English" default /> : null}
        </video>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* Narration as prose — click a paragraph to jump to it. Real <button>s
         * (not clickable <p>): keyboard-reachable, and role-correct for e2e. */}
        <div className="flex min-w-0 flex-col gap-5">
          {transcript.map((line, i) => (
            <button
              type="button"
              key={line.start}
              onClick={() => seek(line.start, undefined, i)}
              className={`cursor-pointer text-left text-[15px] leading-relaxed transition-colors ${
                i === activeLine ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {line.text}
            </button>
          ))}
        </div>

        {/* Sticky chapter rail */}
        <nav aria-label="Chapters" className="self-start lg:sticky lg:top-20">
          <p className="text-[13px] font-semibold text-ink">Chapters</p>
          <ol className="mt-3 flex flex-col gap-1">
            {chapters.map((c, i) => (
              <li key={c.title}>
                <button
                  type="button"
                  aria-current={i === active ? "true" : undefined}
                  onClick={() => seek(c.start, i)}
                  className={`flex w-full items-baseline gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    i === active ? "bg-surface-2 text-ink" : "text-ink-subtle hover:bg-surface-1 hover:text-ink"
                  }`}
                >
                  <span className={`text-[12px] tabular-nums ${i === active ? "text-primary" : "text-ink-tertiary"}`}>
                    {fmt(c.start)}
                  </span>
                  <span className="text-[13.5px] font-medium">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );
}
