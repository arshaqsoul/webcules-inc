"use client";
/* The /learn player: video + chapter rail. Clicking a chapter seeks and plays;
 * the rail tracks playback (Linear-style chapter jump list). The transcript
 * below the player also seeks on click. */
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

  const pendingSeek = useRef<number | null>(null);
  const seek = (start: number) => {
    const v = ref.current;
    if (!v) return;
    if (v.readyState === 0) {
      pendingSeek.current = start; // metadata not loaded yet — apply when it is
      v.load();
      return;
    }
    v.currentTime = start;
    void v.play();
  };
  const onLoadedMetadata = () => {
    const v = ref.current;
    if (v && pendingSeek.current != null) {
      v.currentTime = pendingSeek.current;
      pendingSeek.current = null;
      void v.play();
    }
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
          <video
            ref={ref}
            src={src}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={onTime}
            onLoadedMetadata={onLoadedMetadata}
            className="block aspect-video w-full"
            style={{ accentColor: "var(--primary)" }}
          >
            {captions ? <track kind="captions" src={captions} srcLang="en" label="English" default /> : null}
          </video>
        </div>
        <nav aria-label="Chapters" className="flex w-full shrink-0 flex-col lg:w-[248px]">
          <p className="text-[13px] font-semibold text-ink">Chapters</p>
          <ol className="mt-2 flex flex-row gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {chapters.map((c, i) => (
              <li key={c.title} className="shrink-0 lg:shrink">
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
                  <span className="whitespace-nowrap text-[13.5px] font-medium lg:whitespace-normal">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <section className="mt-10" aria-label="Transcript">
        <h2 className="text-[15px] font-semibold text-ink">Transcript</h2>
        <div className="mt-3 flex flex-col">
          {transcript.map((line, i) => (
            <button
              key={line.start}
              type="button"
              onClick={() => seek(line.start)}
              className={`flex items-baseline gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                i === activeLine ? "bg-surface-1" : "hover:bg-surface-1"
              }`}
            >
              <span className="shrink-0 text-[12px] tabular-nums text-ink-tertiary">{fmt(line.start)}</span>
              <span className="text-[13.5px] leading-relaxed text-ink-muted">{line.text}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
