import React, { useState } from "react";
import { FollowingEyes } from "@webcules/ui/components/ui/following-eyes";
import { CustomCursor } from "@webcules/ui/components/ui/custom-cursor";
import { TweakPanel, type TweakItem, type TweakValues } from "../components/TweakPanel";

export const meta = {
  slug: "following-eyes",
  title: "Following Eyes",
  component: "following-eyes",
  description: "Upload any image — the eyes follow the cursor everywhere. ?panel=1 exposes every prop live",
};

type VariantDef = TweakValues & { img: string };

const IMAGES = {
  buddy: {
    src: "/demos/following-eyes-buddy.png",
    alt: "Knitted lavender mascot holding a pink heart",
    eyes: [
      { x: 36.9, y: 41.5 },
      { x: 62.7, y: 41.3 },
    ],
    bg: "#f2ede4",
    ink: "#2b2438",
    sub: "rgba(43,36,56,0.6)",
  },
  scout: {
    src: "/demos/following-eyes-scout.png",
    alt: "Sleepy tiny astronaut",
    eyes: [
      { x: 40.5, y: 38.4 },
      { x: 60.1, y: 38.3 },
    ],
    bg: "#12172e",
    ink: "#ffffff",
    sub: "rgba(255,255,255,0.62)",
  },
};

const VARIANTS: Record<string, VariantDef> = {
  "pastel-buddy": {
    img: "buddy", eyeSize: 12, pupilRatio: 0.58, pupilColor: "#141416", shine: true,
    tear: "click", blink: true, radius: 0.4, stiffness: 0.14, idle: true, cursor: true, copy: true,
  },
  "space-scout": {
    img: "scout", eyeSize: 10.8, pupilRatio: 0.5, pupilColor: "#141416", shine: true,
    tear: "click", blink: true, radius: 0.38, stiffness: 0.16, idle: true, cursor: true, copy: true,
  },
  mono: {
    img: "buddy", eyeSize: 12, pupilRatio: 0.62, pupilColor: "#141416", shine: false,
    tear: "idle", blink: false, radius: 0.42, stiffness: 0.08, idle: true, cursor: false, copy: true,
  },
};

const WIDE_DEFAULTS: TweakValues = {
  eyeSize: 12, pupilRatio: 0.58, pupilColor: "#141416", shine: true, tear: "click",
  blink: true, radius: 0.4, stiffness: 0.14, idle: true, cursor: true, copy: true,
};

const EYES_ITEMS: TweakItem[] = [
  { key: "eyeSize", label: "eye size (%)", type: "range", min: 4, max: 16, step: 0.5, group: "eyes" },
  { key: "pupilRatio", label: "pupil size", type: "range", min: 0.3, max: 0.8, step: 0.02, group: "eyes" },
  { key: "pupilColor", label: "pupil color", type: "color", group: "eyes" },
  { key: "shine", label: "shine glint", type: "toggle", group: "eyes" },
  { key: "radius", label: "travel clamp", type: "range", min: 0.15, max: 0.7, step: 0.01, group: "motion" },
  { key: "stiffness", label: "stiffness", type: "range", min: 0.04, max: 0.5, step: 0.01, group: "motion" },
  { key: "blink", label: "blink", type: "toggle", group: "life" },
  { key: "idle", label: "idle wander", type: "toggle", group: "life" },
  { key: "tear", label: "tear", type: "select", group: "life",
    options: [
      { value: "off", label: "off" },
      { value: "click", label: "on click" },
      { value: "idle", label: "while idle" },
    ] },
  { key: "cursor", label: "custom cursor", type: "toggle", group: "scene" },
  { key: "copy", label: "hero copy", type: "toggle", group: "scene" },
];

function useFadeUp(delay: number): React.CSSProperties {
  return {
    opacity: 0,
    animation: `sf-fade-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s forwards`,
  };
}

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
  const v = VARIANTS[variant] ?? VARIANTS["pastel-buddy"]!;
  const [cfg, setCfg] = useState<TweakValues>(() => ({ ...WIDE_DEFAULTS, ...v }));
  const [liveLayout, setLiveLayout] = useState(layout);
  const set = (key: string, val: TweakValues[string]) => setCfg((c) => ({ ...c, [key]: val }));
  const useVariant = (name: string) => {
    const p = VARIANTS[name];
    if (!p) return;
    setCfg((c) => ({ ...c, ...p }));
  };

  const activeLayout = panel ? liveLayout : layout;
  const img = IMAGES[String(cfg.img ?? v.img) as keyof typeof IMAGES] ?? IMAGES.buddy!;
  const num = (k: string, d: number) => (typeof cfg[k] === "number" ? (cfg[k] as number) : d);
  const bool = (k: string, d: boolean) => (typeof cfg[k] === "boolean" ? (cfg[k] as boolean) : d);
  const tearProp = cfg.tear === "off" ? false : cfg.tear === "click" ? "click" : cfg.tear === "idle" ? "idle" : (v.tear ?? "click");

  const PanelExtras = (
    <div className="mb-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="flex gap-1">
        {["wide", "vertical"].map((l) => (
          <button
            key={l}
            onClick={() => setLiveLayout(l)}
            className={`flex-1 rounded px-2 py-1 font-mono ${liveLayout === l ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {Object.keys(VARIANTS).map((name) => (
          <button
            key={name}
            onClick={() => useVariant(name)}
            className={`flex-1 rounded px-2 py-1 font-mono text-[10px] ${cfg.img === VARIANTS[name]!.img ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="font-mono text-white/40">click the mascot → tear · move the pointer → the eyes follow</div>
    </div>
  );

  const mascot = (
    <FollowingEyes
      src={img.src}
      alt={img.alt}
      eyes={img.eyes}
      eyeSize={num("eyeSize", 13.5)}
      pupilRatio={num("pupilRatio", 0.58)}
      pupilColor={String(cfg.pupilColor ?? "#141416")}
      shine={bool("shine", true)}
      tear={tearProp as false | "click" | "idle"}
      blink={bool("blink", true)}
      follow={{ radius: num("radius", 0.4), stiffness: num("stiffness", 0.14) }}
      idle={bool("idle", true) ? "wander" : false}
      seed={1}
      style={{ width: "min(58vw, 44vh)" }}
      className="overflow-hidden rounded-[2rem] shadow-[0_30px_80px_-20px_rgba(20,15,45,0.45)]"
    />
  );

  if (activeLayout === "vertical") {
    return (
      <div className="fixed inset-0 overflow-hidden font-sans" style={{ backgroundColor: img.bg }}>
        {bool("cursor", true) && <CustomCursor />}
        <div className="relative z-10 flex h-full flex-col items-center justify-between py-14 text-center">
          <p style={{ ...useFadeUp(0.25), color: img.ink }} className="mx-auto max-w-[86%] text-[42px] font-semibold leading-[1.14] tracking-tight">
            {hook || "Eyes that never lose sight of you."}
          </p>
          {mascot}
          <div style={{ ...useFadeUp(0.8) }}>
            <p style={{ color: img.ink }} className="text-[24px] font-bold tracking-[0.3em]">
              WEBCULES
            </p>
            <p style={{ color: img.sub }} className="mt-2 text-[15px]">
              Saskatoon · webcules.com
            </p>
          </div>
        </div>
        {panel && <TweakPanel title="following eyes" items={EYES_ITEMS} value={cfg} onChange={set} extra={PanelExtras} />}
        <style>{`@keyframes sf-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden font-sans" style={{ backgroundColor: img.bg }}>
      {bool("cursor", true) && <CustomCursor />}
      {bool("copy", true) && (
        <>
          <div style={{ ...useFadeUp(0.15), color: img.ink }} className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-12 py-8 text-sm">
            <div>
              <p className="text-xs opacity-60">have a project in mind?</p>
              <p className="mt-4 text-2xl font-bold leading-tight tracking-tight">
                imagination
                <br />
                meets craft
              </p>
              <nav className="mt-8 space-y-3 opacity-80">
                {["Made", "Story", "In the lab", "Say hey"].map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </nav>
            </div>
            <p className="text-lg font-bold tracking-[0.28em]">WEBCULES</p>
            <div className="text-right">
              <p className="text-xs opacity-60">say hey</p>
              <p className="mt-4 text-2xl font-bold leading-tight tracking-tight">
                let's team up!
                <br />
                bring us your idea*
              </p>
              <p className="mt-4 text-xs opacity-50">*the mascot already sees your cursor.</p>
            </div>
          </div>
          <p style={{ ...useFadeUp(0.9), color: img.sub }} className="absolute inset-x-0 bottom-7 z-10 text-center text-sm">
            Webcules Inc · $10k-quality websites · Saskatoon, SK
          </p>
        </>
      )}
      <main className="relative z-0 flex h-full items-end justify-center pb-[6vh]">
        <div style={useFadeUp(0.35)}>{mascot}</div>
      </main>
      {panel && <TweakPanel title="following eyes" items={EYES_ITEMS} value={cfg} onChange={set} extra={PanelExtras} />}
      <style>{`@keyframes sf-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
