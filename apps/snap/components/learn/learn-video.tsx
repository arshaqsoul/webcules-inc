"use client";
/* /learn player — Linear-style: full-width video, then the narration as
 * prose with a sticky chapter rail beside it. Clicking a chapter (or a
 * transcript paragraph) seeks the video; the rail tracks playback. */
import { useRef, useState } from "react";

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
  const [active, setActive] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);

  // Robust seek: applies once metadata is ready, re-applies on canplay in
  // case the initial assignment raced the loader, then plays.
  const seek = (start: number) => {
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
    setActive(a);
    let l = -1;
    transcript.forEach((line, i) => {
      if (t >= line.start - 0.15) l = i;
    });
    setActiveLine(l);
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
        {/* Narration as prose — click a paragraph to jump to it */}
        <div className="flex min-w-0 flex-col gap-5">
          {transcript.map((line, i) => (
            <p
              key={line.start}
              onClick={() => seek(line.start)}
              className={`cursor-pointer text-[15px] leading-relaxed transition-colors ${
                i === activeLine ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {line.text}
            </p>
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
                  onClick={() => seek(c.start)}
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
