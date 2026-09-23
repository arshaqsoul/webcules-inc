import React, { useEffect, useRef, useState } from "react";
import { CineScroll, CineIndexRows, CineStat } from "@webcules/ui/components/ui/cine-scroll";
import { TweakPanel, type TweakItem, type TweakValues } from "../components/TweakPanel";

export const meta = {
  slug: "cine-scroll",
  title: "CineScroll",
  component: "cine-scroll",
  description:
    "Scroll-scrubbed cinematic hero — SHŪDEN, a last-train story in ten ComfyUI plates. ?panel=1: upload your own scenes, edit the chapters, tune the film.",
};

/* ── story plates (generated locally with ComfyUI) ──
 * night-line: 16 frames extracted from one Wan 2.2 image→video camera move —
 * they align perfectly because they ARE one continuous shot.
 * The clip itself ships too: the panel can scrub the actual video. */

type VariantName = "night-line" | "neon-rain" | "ink-dawn";

const PLATE_COUNTS: Record<VariantName, number> = {
  "night-line": 16,
  "neon-rain": 10,
  "ink-dawn": 10,
};

const platesFor = (variant: VariantName) =>
  Array.from(
    { length: PLATE_COUNTS[variant] },
    (_, i) => `/assets/cine-scroll/${variant}/p${String(i + 1).padStart(2, "0")}.webp`,
  );

const STORY_VIDEO = "/assets/cine-scroll/night-line.mp4";

const VARIANTS: Record<VariantName, { label: string; grade: { vignette: number; grain: number } }> = {
  "night-line": { label: "SHŪDEN — the last train", grade: { vignette: 0.4, grain: 0.12 } },
  "neon-rain": { label: "SIGNAL — the rain detour", grade: { vignette: 0.5, grain: 0.2 } },
  "ink-dawn": { label: "HA-GANE — ink dawn", grade: { vignette: 0.25, grain: 0.16 } },
};

/* ── editable chapters — the panel writes straight into these ── */

type ChapterKind = "hero" | "para" | "index" | "stats";
type Align = "left" | "center" | "right";

interface ChapterCfg {
  kind: ChapterKind;
  from: number;
  to: number;
  align: Align;
  eyebrow: string;
  title: string;
  sub: string;
  rows: string;
}

const STORY: ChapterCfg[] = [
  {
    kind: "hero", from: 0, to: 0.18, align: "center",
    eyebrow: "A LAST-TRAIN STORY · 終電",
    title: "SHŪDEN",
    sub: "She missed the 23:47. The city had one more way home.",
    rows: "",
  },
  {
    kind: "para", from: 0.24, to: 0.46, align: "left",
    eyebrow: "",
    title:
      "No trains till dawn — four hours, a sleeping city, and a white fox who knew every gate. She follows it down the stairs and out of the timetable.",
    sub: "", rows: "",
  },
  {
    kind: "index", from: 0.52, to: 0.74, align: "right",
    eyebrow: "THE NIGHT LINE",
    title: "SEVEN STOPS TO SUNRISE",
    sub: "",
    rows: "23:58 | Kanda | where the fox waited\n01:12 | Sumida | the long bridge\n02:46 | Hanazono | a coin for passage",
  },
  {
    kind: "stats", from: 0.82, to: 1, align: "center",
    eyebrow: "",
    title: "The 4:07 arrives with the sun.",
    sub: "",
    rows: "STATIONS | 7\nGATES | 3\nFOXES | 1",
  },
];

function chapterContent(c: ChapterCfg) {
  if (c.kind === "hero") {
    return (
      <div className="text-center text-white">
        <p className="text-[11px] uppercase tracking-[0.4em] text-white/80">{c.eyebrow}</p>
        <h1 className="mt-3 text-6xl font-semibold tracking-tight md:text-8xl">{c.title}</h1>
        <p className="mt-4 text-sm text-white/75 md:text-base">{c.sub}</p>
      </div>
    );
  }
  if (c.kind === "para") {
    return <p className="max-w-xl text-lg leading-relaxed text-white drop-shadow md:text-2xl">{c.title}</p>;
  }
  if (c.kind === "index") {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">{c.eyebrow}</p>
        <h2 className="mt-2 text-4xl font-semibold text-white md:text-5xl">{c.title}</h2>
        <CineIndexRows
          className="mt-6"
          rows={c.rows
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const [year, title, note] = line.split("|").map((s) => s.trim());
              return { year, title: title ?? "", note };
            })}
        />
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-end justify-center gap-10 md:gap-14">
        {c.rows
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [label, value] = line.split("|").map((s) => s.trim());
            return <CineStat key={label} label={label} value={value} />;
          })}
      </div>
      <p className="mt-6 text-center text-sm text-white/75">{c.title}</p>
    </div>
  );
}

/* ── panel schema: the film props (scenes/chapters are custom panel UI) ── */

const FILM_ITEMS: TweakItem[] = [
  {
    key: "blend", label: "blend", type: "select", group: "film",
    options: [
      { value: "exposure", label: "double exposure" },
      { value: "crossfade", label: "crossfade" },
    ],
  },
  { key: "motionBlur", label: "whip blur", type: "range", min: 0, max: 1, step: 0.05, group: "film" },
  { key: "drift", label: "drift", type: "range", min: 0, max: 0.15, step: 0.005, group: "film" },
  { key: "scrollSmoothing", label: "damping", type: "range", min: 0, max: 0.4, step: 0.01, group: "scrub" },
  { key: "vignette", label: "vignette", type: "range", min: 0, max: 0.8, step: 0.05, group: "grade" },
  { key: "grain", label: "grain", type: "range", min: 0, max: 0.4, step: 0.02, group: "grade" },
];

/* slow deterministic auto-drive so recordings show the scrub; first wheel/touch hands control back */
function useAutoDrive(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean, ms = 16000) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let raf = 0;
    let dead = false;
    let t0: number | null = null;
    const HOLD = 3000;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const stop = () => {
      dead = true;
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    const loop = (now: number) => {
      if (dead) return;
      if (t0 === null) t0 = now;
      const t = (now - t0) % (ms + HOLD);
      const p = t <= ms ? ease(t / ms) : 1;
      el.scrollTop = p * (el.scrollHeight - el.clientHeight);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return stop;
  }, [ref, enabled, ms]);
}

const inputCls =
  "w-full rounded border border-white/20 bg-black/50 px-2 py-1 font-mono text-[11px] text-white";

export default function Demo({
  variant = "",
  layout = "wide",
  hook = "",
  panel = false,
}: {
  variant?: string;
  layout?: string;
  hook?: string;
  panel?: boolean;
}) {
  const initialVariant: VariantName = (VARIANTS[variant as VariantName] ? variant : "night-line") as VariantName;
  const [variantName, setVariantName] = useState<VariantName>(initialVariant);
  const [frames, setFrames] = useState<string[]>(() => platesFor(initialVariant));
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [chapters, setChapters] = useState<ChapterCfg[]>(() => STORY.map((c) => ({ ...c })));
  const [cfg, setCfg] = useState<TweakValues>(() => ({
    blend: "exposure",
    motionBlur: 0.6,
    drift: 0,
    scrollSmoothing: 0.14,
    vignette: VARIANTS[initialVariant].grade.vignette,
    grain: VARIANTS[initialVariant].grade.grain,
  }));
  const [liveLayout, setLiveLayout] = useState(layout);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useAutoDrive(scrollerRef, true, liveLayout === "vertical" ? 13000 : 17000);

  const set = (key: string, val: TweakValues[string]) => setCfg((c) => ({ ...c, [key]: val }));

  const useVariantPreset = (name: VariantName) => {
    setVariantName(name);
    setFrames(platesFor(name));
    setCfg((c) => ({ ...c, vignette: VARIANTS[name].grade.vignette, grain: VARIANTS[name].grade.grain }));
  };

  const onScenesUpload = (files: FileList | null) => {
    if (!files?.length) return;
    setVideoUrl(undefined);
    setFrames(Array.from(files, (f) => URL.createObjectURL(f)));
  };
  const onVideoUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setVideoUrl(URL.createObjectURL(file));
  };
  const useStoryVideo = () => setVideoUrl(STORY_VIDEO);
  const clearVideo = () => setVideoUrl(undefined);
  const onChaptersUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    file
      .text()
      .then((json) => {
        const parsed = JSON.parse(json) as ChapterCfg[];
        if (Array.isArray(parsed) && parsed.length) {
          setChapters(parsed.map((c) => ({ ...STORY[0], ...c })));
        }
      })
      .catch(() => {});
  };
  const setChapter = (i: number, patch: Partial<ChapterCfg>) =>
    setChapters((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const stage = (
    <CineScroll
      frames={videoUrl ? [] : frames}
      video={videoUrl}
      height="500vh"
      stageHeight="100vh"
      blend={cfg.blend as "exposure" | "crossfade"}
      motionBlur={Number(cfg.motionBlur)}
      drift={Number(cfg.drift)}
      scrollSmoothing={Number(cfg.scrollSmoothing)}
      grade={{ vignette: Number(cfg.vignette), grain: Number(cfg.grain) }}
      chapters={chapters.map((c) => ({
        from: c.from,
        to: c.to,
        align: c.align,
        content: chapterContent(c),
      }))}
    />
  );

  const vertical = panel ? liveLayout === "vertical" : layout === "vertical";

  if (vertical) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black font-sans" style={{ colorScheme: "dark" }}>
        <div ref={scrollerRef} className="h-full w-full overflow-y-auto overscroll-contain">
          {stage}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-8 text-center">
          <p className="text-[26px] font-semibold leading-[1.15] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            {hook || "She missed the last train. The city had one more way home."}
          </p>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-8 text-center">
          <p className="text-[20px] font-bold tracking-[0.3em] text-white">WEB CULES</p>
          <p className="mt-2 text-[13px] text-white/60">webcules.com</p>
        </div>
        {panel && (
          <TweakPanel
            title="cine scroll"
            items={FILM_ITEMS}
            value={cfg}
            onChange={set}
            extra={
              <PanelExtras
                {...{
                  variantName, useVariantPreset, frames, onScenesUpload,
                  chapters, setChapter, onChaptersUpload, liveLayout, setLiveLayout,
                  videoUrl, useStoryVideo, clearVideo, onVideoUpload,
                }}
              />
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-sans" style={{ colorScheme: "dark" }}>
      <div ref={scrollerRef} className="h-full w-full overflow-y-auto overscroll-contain">
        {stage}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 font-mono text-[11px] tracking-wide text-white/70 backdrop-blur">
        scroll — the scrollbar is the camera · ?panel=1 to upload scenes &amp; edit chapters
      </div>
      {panel && (
        <TweakPanel
          title="cine scroll"
          items={FILM_ITEMS}
          value={cfg}
          onChange={set}
          extra={
            <PanelExtras
              {...{
                variantName, useVariantPreset, frames, onScenesUpload,
                chapters, setChapter, onChaptersUpload, liveLayout, setLiveLayout,
              }}
            />
          }
        />
      )}
    </div>
  );
}

/* ── panel extras: scenes upload, chapter editor, presets, layout ── */

function PanelExtras({
  variantName,
  useVariantPreset,
  frames,
  onScenesUpload,
  chapters,
  setChapter,
  onChaptersUpload,
  liveLayout,
  setLiveLayout,
  videoUrl,
  useStoryVideo,
  clearVideo,
  onVideoUpload,
}: {
  variantName: VariantName;
  useVariantPreset: (v: VariantName) => void;
  frames: string[];
  onScenesUpload: (f: FileList | null) => void;
  chapters: ChapterCfg[];
  setChapter: (i: number, patch: Partial<ChapterCfg>) => void;
  onChaptersUpload: (f: FileList | null) => void;
  liveLayout: string;
  setLiveLayout: (l: string) => void;
  videoUrl?: string;
  useStoryVideo: () => void;
  clearVideo: () => void;
  onVideoUpload: (f: FileList | null) => void;
}) {
  return (
    <div className="space-y-4 border-b border-white/10 pb-4">
      <div>
        <div className="mb-1 font-mono uppercase tracking-wider text-white/40">layout</div>
        <div className="flex gap-2">
          {["wide", "vertical"].map((l) => (
            <button
              key={l}
              onClick={() => setLiveLayout(l)}
              className={`flex-1 rounded border px-2 py-1 font-mono text-[11px] ${
                liveLayout === l ? "border-white/60 bg-white/15 text-white" : "border-white/20 text-white/60 hover:bg-white/10"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono uppercase tracking-wider text-white/40">video mode (optional)</div>
        <div className="flex gap-1.5">
          <button
            onClick={useStoryVideo}
            className={`flex-1 rounded border px-2 py-1 font-mono text-[11px] ${
              videoUrl === STORY_VIDEO ? "border-white/60 bg-white/15 text-white" : "border-white/20 text-white/60 hover:bg-white/10"
            }`}
          >
            ▶ story clip
          </button>
          <label className="flex-1 cursor-pointer rounded border border-white/20 px-2 py-1 text-center font-mono text-[11px] text-white/60 hover:bg-white/10">
            ⬆ video
            <input type="file" accept="video/*" className="hidden" onChange={(e) => onVideoUpload(e.target.files)} />
          </label>
          {videoUrl && (
            <button
              onClick={clearVideo}
              className="rounded border border-white/20 px-2 py-1 font-mono text-[11px] text-white/60 hover:bg-white/10"
            >
              ✕
            </button>
          )}
        </div>
        {videoUrl && (
          <div className="mt-1 font-mono text-[10px] text-white/40">scrubbing the clip itself — scroll seeks the video</div>
        )}
      </div>

      <div>
        <div className="mb-1 font-mono uppercase tracking-wider text-white/40">story presets</div>
        <div className="space-y-1">
          {(Object.keys(VARIANTS) as VariantName[]).map((name) => (
            <button
              key={name}
              onClick={() => useVariantPreset(name)}
              className={`w-full rounded border px-2 py-1 text-left text-[11px] ${
                variantName === name ? "border-white/60 bg-white/15 text-white" : "border-white/20 text-white/60 hover:bg-white/10"
              }`}
            >
              {VARIANTS[name].label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono uppercase tracking-wider text-white/40">
          scenes — your frames ({frames.length})
        </div>
        <label className="block cursor-pointer rounded border border-dashed border-white/30 px-2 py-2 text-center text-[11px] text-white/70 hover:bg-white/10">
          ⬆ upload images (in story order)
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onScenesUpload(e.target.files)} />
        </label>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between font-mono uppercase tracking-wider text-white/40">
          <span>chapters</span>
          <label className="cursor-pointer text-[10px] normal-case text-white/50 underline hover:text-white">
            import JSON
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => onChaptersUpload(e.target.files)} />
          </label>
        </div>
        <div className="space-y-3">
          {chapters.map((c, i) => (
            <details key={i} className="rounded border border-white/15 px-2 py-1">
              <summary className="cursor-pointer text-[11px] text-white/70">
                {i + 1}. {c.kind} — {c.title.slice(0, 24) || "…"}
              </summary>
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-1.5">
                  <label className="flex items-center gap-1 text-[10px] text-white/50">
                    from
                    <input
                      type="number" min={0} max={100} value={Math.round(c.from * 100)}
                      onChange={(e) => setChapter(i, { from: Number(e.target.value) / 100 })}
                      className="w-11 rounded border border-white/20 bg-black/50 px-1 py-1 font-mono text-[11px] text-white"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-white/50">
                    to
                    <input
                      type="number" min={0} max={100} value={Math.round(c.to * 100)}
                      onChange={(e) => setChapter(i, { to: Number(e.target.value) / 100 })}
                      className="w-11 rounded border border-white/20 bg-black/50 px-1 py-1 font-mono text-[11px] text-white"
                    />
                  </label>
                  <select
                    value={c.align}
                    onChange={(e) => setChapter(i, { align: e.target.value as Align })}
                    className="min-w-0 flex-1 rounded border border-white/20 bg-black/50 px-1 py-1 font-mono text-[11px] text-white"
                  >
                    <option value="left">left</option>
                    <option value="center">center</option>
                    <option value="right">right</option>
                  </select>
                </div>
                {c.kind !== "para" && (
                  <input
                    value={c.eyebrow}
                    onChange={(e) => setChapter(i, { eyebrow: e.target.value })}
                    placeholder="eyebrow"
                    className={inputCls}
                  />
                )}
                <textarea
                  value={c.title}
                  onChange={(e) => setChapter(i, { title: e.target.value })}
                  rows={c.kind === "para" ? 4 : 1}
                  placeholder={c.kind === "para" ? "paragraph" : "title"}
                  className={inputCls}
                />
                {(c.kind === "hero") && (
                  <input
                    value={c.sub}
                    onChange={(e) => setChapter(i, { sub: e.target.value })}
                    placeholder="subtitle"
                    className={inputCls}
                  />
                )}
                {(c.kind === "index" || c.kind === "stats") && (
                  <textarea
                    value={c.rows}
                    onChange={(e) => setChapter(i, { rows: e.target.value })}
                    rows={3}
                    placeholder={c.kind === "index" ? "year | title | note (per line)" : "label | value (per line)"}
                    className={inputCls}
                  />
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
