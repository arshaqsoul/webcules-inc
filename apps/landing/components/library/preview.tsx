"use client";

/* Live preview renderers — one per registry component. Each renderer owns its
 * stage (background, height, overlay) and maps saved/tweaked ConfigValues onto
 * the real component props. Used by the playground AND the dashboard cards. */
import { useState } from "react";
import type { ReactNode } from "react";

import { NeuralPathways } from "@webcules/ui/components/ui/neural-pathways";
import { SilkAurora } from "@webcules/ui/components/ui/silk-aurora";
import { LiquidBulb } from "@webcules/ui/components/ui/liquid-bulb";
import { CardTrain } from "@webcules/ui/components/ui/card-train";
import { FollowingEyes } from "@webcules/ui/components/ui/following-eyes";
import { CineScroll, CineIndexRows, CineStat } from "@webcules/ui/components/ui/cine-scroll";
import type { CineScrollChapter } from "@webcules/ui/components/ui/cine-scroll";
import { WildcodeField } from "@webcules/ui/components/wildcode-field";

import type { ConfigValues } from "@/lib/saved-configs";

const num = (v: ConfigValues[string] | undefined, fallback: number) =>
  typeof v === "number" ? v : fallback;
const bool = (v: ConfigValues[string] | undefined, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;
const str = (v: ConfigValues[string] | undefined, fallback: string) =>
  typeof v === "string" ? v : fallback;

function WildcodeFieldPreview({ v }: { v: ConfigValues }): ReactNode {
  return (
    <div
      className="relative h-[340px] w-full overflow-hidden"
      style={{ background: "linear-gradient(180deg,#fdfaf6 0%,#f4eef9 100%)" }}
    >
      <WildcodeField
        className="absolute inset-0"
        phrase={str(v.phrase, "Start today")}
        letterColor={str(v.letterColor, "#5839a8")}
        spriteSet={str(v.spriteSet, "flowers") as "flowers" | "stars" | "bubbles" | "hearts"}
        critterStyle={str(v.critterStyle, "drone") as "drone" | "bee" | "ghost"}
        clipFlowers={bool(v.clipFlowers, false)}
        hoverRecolor={bool(v.hoverRecolor, true)}
        seed={num(v.seed, 7)}
        flowerDensity={num(v.flowerDensity, 1)}
        vineCount={num(v.vineCount, 26)}
        droneCount={num(v.droneCount, 4)}
        sway={num(v.sway, 0.14)}
        beamDur={num(v.beamDur, 6)}
        holdDur={num(v.holdDur, 5)}
      />
    </div>
  );
}

function NeuralPathwaysPreview({ v }: { v: ConfigValues }): ReactNode {
  return (
    <div className="relative h-[480px] w-full overflow-hidden">
      <NeuralPathways
        className="absolute inset-0"
        primary={str(v.primary, "#f5b04c")}
        secondary={str(v.secondary, "#3fb6ff")}
        crossTint={num(v.crossTint, 0.35)}
        streamCount={num(v.streamCount, 18)}
        heroStrands={num(v.heroStrands, 3)}
        thickness={num(v.thickness, 1)}
        spread={num(v.spread, 0.135)}
        waveAmp={num(v.waveAmp, 0.5)}
        waveFreq={num(v.waveFreq, 2.2)}
        focalX={num(v.focalX, 0.5)}
        focalY={num(v.focalY, 0.535)}
        lensGap={num(v.lensGap, 0.075)}
        zoom={num(v.zoom, 1)}
        pulseLines={bool(v.pulseLines, true)}
        glow={num(v.glow, 1)}
        speed={num(v.speed, 1)}
        particleDensity={num(v.particleDensity, 1)}
        particleSize={num(v.particleSize, 1)}
        starDensity={num(v.starDensity, 1)}
        starSize={num(v.starSize, 1)}
        showClouds={bool(v.showClouds, true)}
        cloudDensity={num(v.cloudDensity, 0.8)}
        cloudSpeed={num(v.cloudSpeed, 1)}
        cloudPosition={str(v.cloudPosition, "corners") as "corners" | "bottom" | "top" | "veil"}
        cloudTint={str(v.cloudTint, "#a8c0dd")}
        seed={num(v.seed, 7)}
        bgTop={str(v.bgTop, "#04060d")}
        bgMid={str(v.bgMid, "#0a1024")}
        bgBottom={str(v.bgBottom, "#101a38")}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(4,6,13,0.4),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-8">
        <p className="text-2xl font-semibold tracking-tight text-white/90">
          Websites that stop the scroll.
        </p>
      </div>
    </div>
  );
}

function SilkAuroraPreview({ v }: { v: ConfigValues }): ReactNode {
  return (
    <div className="relative h-[480px] w-full overflow-hidden">
      <SilkAurora
        className="absolute inset-0"
        colors={str(v.colors, "#ff8a3d,#e2314d,#9333ea,#818cf8")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)}
        count={num(v.count, 2)}
        background={str(v.background, "#ffffff")}
        orientation={num(v.orientation, -35)}
        scale={num(v.scale, 0.85)}
        curvature={num(v.curvature, 0.55)}
        amplitude={num(v.amplitude, 0.5)}
        width={num(v.width, 0.5)}
        length={num(v.length, 1.25)}
        speed={num(v.speed, 1)}
        drift={num(v.drift, 0.7)}
        interactive={bool(v.interactive, false)}
        intensity={num(v.intensity, 0.85)}
        softness={num(v.softness, 0.55)}
        blend={str(v.blend, "normal") as "normal" | "multiply" | "screen" | "overlay"}
        sheen={num(v.sheen, 0.5)}
        grain={num(v.grain, 0)}
        seed={num(v.seed, 1)}
      />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-[clamp(32px,4.5vw,56px)] font-semibold leading-[1.08] tracking-tight text-neutral-900">
          retro soul, modern vision.
        </p>
        <p className="mt-5 max-w-md text-base text-neutral-600">
          Flowing silk, painted by code — your palette, your hero.
        </p>
      </div>
    </div>
  );
}

function LiquidBulbPreview({ v }: { v: ConfigValues }): ReactNode {
  return (
    <div className="relative h-[480px] w-full overflow-hidden">
      <LiquidBulb
        className="absolute inset-0"
        colors={str(v.colors, "#ba1766,#0089b3,#163cd4,#774ac9,#df307b")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)}
        background={str(v.background, "#ffffff")}
        size={num(v.size, 0.85)}
        scale={num(v.scale, 0.85)}
        bands={num(v.bands, 3)}
        tilt={num(v.tilt, -63)}
        swirl={num(v.swirl, 1)}
        speed={num(v.speed, 0.6)}
        interactive={bool(v.interactive, false)}
        frost={num(v.frost, 1)}
        iridescence={num(v.iridescence, 0.85)}
        gloss={num(v.gloss, 0.8)}
        softness={num(v.softness, 0.65)}
        shadow={num(v.shadow, 0.4)}
        grain={num(v.grain, 0)}
        seed={num(v.seed, 1)}
      />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="max-w-xl text-[clamp(32px,4.5vw,56px)] font-semibold leading-[1.08] tracking-tight text-neutral-900">
          Signals from
          <br />
          the deep green
        </p>
        <p className="mt-5 max-w-md text-base text-neutral-600">
          Liquid glass, painted by code — one sphere, every palette.
        </p>
      </div>
    </div>
  );
}

function CardTrainPreview({ v }: { v: ConfigValues }): ReactNode {
  return (
    <div className="relative h-[480px] w-full overflow-hidden">
      <CardTrain
        className="absolute inset-0"
        colors={str(v.colors, "#f4a7b3,#a9b6e6,#d9aee0")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)}
        background={str(v.background, "#e8e6e2")}
        cardSize={num(v.cardSize, 150)}
        count={num(v.count, 26)}
        overlap={num(v.overlap, 0.65)}
        amplitude={num(v.amplitude, 0.18)}
        wavelength={num(v.wavelength, 1.4)}
        speed={num(v.speed, 0.12)}
        tilt={num(v.tilt, 1)}
        depth={num(v.depth, 0.25)}
        confetti={bool(v.confetti, true)}
        confettiCount={num(v.confettiCount, 24)}
        seed={num(v.seed, 1)}
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-8">
        <p className="self-end text-right font-serif text-lg italic leading-snug text-neutral-500">
          Every card dealt,
          <br />
          every promise kept
        </p>
        <p className="text-[clamp(36px,5vw,60px)] font-semibold leading-[1.05] tracking-tight text-neutral-900">
          Always be
          <br />
          <span className="text-violet-600">shipping.</span>
        </p>
      </div>
    </div>
  );
}

/** Known demo faces → their measured eye centers (% of the image box). Any
 *  other src falls back to the default centered pair. */
const EYE_COORDS: { match: string; eyes: { x: number; y: number }[] }[] = [
  {
    match: "following-eyes-buddy",
    eyes: [
      { x: 36.9, y: 41.5 },
      { x: 62.7, y: 41.3 },
    ],
  },
  {
    match: "following-eyes-scout",
    eyes: [
      { x: 40.5, y: 38.4 },
      { x: 60.1, y: 38.3 },
    ],
  },
];

function FollowingEyesPreview({ v }: { v: ConfigValues }): ReactNode {
  const src = str(v.src, "/mascots/following-eyes-buddy.png");
  const coords =
    EYE_COORDS.find((e) => src.includes(e.match))?.eyes ??
    [
      { x: 42, y: 38 },
      { x: 58, y: 38 },
    ];
  const tear = v.tear === "off" ? false : str(v.tear, "click") as "click" | "idle";
  return (
    <div
      className="relative flex h-[480px] w-full items-end justify-center overflow-hidden pb-10"
      style={{ backgroundColor: src.includes("following-eyes-scout") ? "#12172e" : "#f2ede4" }}
    >
      <FollowingEyes
        src={src}
        alt="Mascot with following eyes"
        eyes={coords}
        eyeSize={num(v.eyeSize, 7)}
        pupilRatio={num(v.pupilRatio, 0.55)}
        pupilColor={str(v.pupilColor, "#141416")}
        shine={bool(v.shine, true)}
        tear={tear}
        blink={bool(v.blink, true)}
        follow={{ radius: num(v.radius, 0.4), stiffness: num(v.stiffness, 0.14) }}
        idle={bool(v.idle, true) ? "wander" : false}
        seed={num(v.seed, 1)}
        style={{ width: "min(52vw, 300px)" }}
        className="overflow-hidden rounded-[1.5rem] shadow-[0_24px_60px_-20px_rgba(20,15,45,0.45)]"
      />
    </div>
  );
}

/* SHŪDEN (終電) — the CineScroll demo story: a girl misses the last train and a
 * white fox walks her across the sleeping city to the 4:07. The night-line plates
 * are 16 frames extracted from one Wan 2.2 image→video camera move generated
 * locally with ComfyUI — they align perfectly because they are one shot. */
const CINE_NIGHT_FRAMES = Array.from(
  { length: 16 },
  (_, i) => `/components/cine-scroll/night-line/p${String(i + 1).padStart(2, "0")}.webp`,
);

const CINE_CHAPTERS: CineScrollChapter[] = [
  {
    from: 0,
    to: 0.18,
    align: "center",
    content: (
      <div className="text-center text-white">
        <p className="text-[11px] uppercase tracking-[0.4em] text-white/80">
          A last-train story · 終電
        </p>
        <h1 className="mt-3 text-6xl font-semibold tracking-tight md:text-8xl">SHŪDEN</h1>
        <p className="mt-4 text-sm text-white/75">
          She missed the 23:47. The city had one more way home.
        </p>
      </div>
    ),
  },
  {
    from: 0.24,
    to: 0.46,
    align: "left",
    content: (
      <p className="text-lg leading-relaxed text-white drop-shadow md:text-2xl">
        No trains till dawn — four hours, a sleeping city, and a white fox who knew every
        gate. She follows it down the stairs and out of the timetable.
      </p>
    ),
  },
  {
    from: 0.52,
    to: 0.74,
    align: "right",
    content: (
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">The night line</p>
        <h2 className="mt-2 text-4xl font-semibold text-white md:text-5xl">
          SEVEN STOPS TO SUNRISE
        </h2>
        <CineIndexRows
          className="mt-6"
          rows={[
            { year: "23:58", title: "Kanda", note: "where the fox waited" },
            { year: "01:12", title: "Sumida", note: "the long bridge" },
            { year: "02:46", title: "Hanazono", note: "a coin for passage" },
          ]}
        />
      </div>
    ),
  },
  {
    from: 0.82,
    to: 1,
    align: "center",
    at: "bottom",
    content: (
      <div>
        <div className="flex items-end justify-center gap-10 md:gap-14">
          <CineStat label="Stations" value="7" />
          <CineStat label="Gates" value="3" />
          <CineStat label="Foxes" value="1" />
        </div>
        <p className="mt-6 text-center text-sm text-white/75">The 4:07 arrives with the sun.</p>
      </div>
    ),
  },
];

function CineScrollPreview({ v }: { v: ConfigValues }): ReactNode {
  const [frames, setFrames] = useState<string[]>(CINE_NIGHT_FRAMES);
  const videoUrl = str(v.video, "");
  const onUpload = (files: FileList | null) => {
    if (!files?.length) return;
    setFrames(Array.from(files, (f) => URL.createObjectURL(f)));
  };
  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-2xl bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
      <div className="h-full w-full overflow-y-auto overscroll-contain" data-cine-preview>
        <CineScroll
          frames={videoUrl ? [] : frames}
          video={videoUrl}
          height="420vh"
          stageHeight="520px"
          blend={str(v.blend, "exposure") as "exposure" | "crossfade"}
          motionBlur={num(v.motionBlur, 0.6)}
          drift={num(v.drift, 0.06)}
          scrollSmoothing={num(v.scrollSmoothing, 0.14)}
          grade={{ vignette: num(v.vignette, 0.35), grain: num(v.grain, 0.12) }}
          chapters={CINE_CHAPTERS}
        />
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3">
        <label className="cursor-pointer rounded-full bg-black/55 px-3 py-1 text-[11px] tracking-wide text-white/70 backdrop-blur transition-colors hover:bg-black/75 hover:text-white">
          ⬆ use your own scenes
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
        </label>
        {frames !== CINE_NIGHT_FRAMES && (
          <button
            onClick={() => setFrames(CINE_NIGHT_FRAMES)}
            className="rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/70 backdrop-blur hover:bg-black/75 hover:text-white"
          >
            ↺ story
          </button>
        )}
        <div className="pointer-events-none rounded-full bg-black/55 px-3 py-1 text-[11px] tracking-wide text-white/70 backdrop-blur">
          scroll — the scrollbar is the camera
        </div>
      </div>
    </div>
  );
}

const RENDERERS: Record<string, (p: { v: ConfigValues }) => ReactNode> = {
  "wildcode-field": WildcodeFieldPreview,
  "neural-pathways": NeuralPathwaysPreview,
  "silk-aurora": SilkAuroraPreview,
  "liquid-bulb": LiquidBulbPreview,
  "card-train": CardTrainPreview,
  "following-eyes": FollowingEyesPreview,
  "cine-scroll": CineScrollPreview,
};

export function renderPreview(name: string, v: ConfigValues): ReactNode {
  const Renderer = RENDERERS[name];
  if (!Renderer) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-white/40">
        Preview coming soon.
      </div>
    );
  }
  return <Renderer v={v} />;
}
