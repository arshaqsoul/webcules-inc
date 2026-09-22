import React, { useState } from "react";
import { NeuralPathways } from "@webcules/ui/components/ui/neural-pathways";
import { TweakPanel, type TweakItem, type TweakValues } from "../components/TweakPanel";

export const meta = {
  slug: "neural-pathways",
  title: "Neural Pathways",
  component: "neural-pathways",
  description: "Dual-waist light-stream lens, fully parametric SVG — ?panel=1 exposes every prop live",
};

const VARIANTS: Record<string, { primary: string; secondary: string }> = {
  neural: { primary: "#f5b04c", secondary: "#3fb6ff" },
  aurora: { primary: "#34d399", secondary: "#a78bfa" },
  synapse: { primary: "#fb7185", secondary: "#7dd3fc" },
};

/** locally-generated ComfyUI texture — only used on the no-WebGL fallback path */
const CLOUDS = "/assets/neural-pathways/cloud-banks.png";

/** tuned defaults per layout (recordings use these — the panel only overrides when ?panel=1) */
const WIDE_DEFAULTS: TweakValues = {
  streamCount: 26, heroStrands: 4, thickness: 1.35, waveAmp: 0.55, waveFreq: 2.4,
  spread: 0.135, focalX: 0.5, focalY: 0.535, lensGap: 0.075, crossTint: 0.38,
  zoom: 1, glow: 1.3, speed: 1.1, particleDensity: 1, starDensity: 1,
  cloudDensity: 0.9, cloudSpeed: 1, showClouds: true, showStars: true, showContent: true,
  seed: 7, bgTop: "#04060d", bgMid: "#081020", bgBottom: "#0c1526",
  pulseLines: true, cloudPosition: "corners", cloudTint: "#a8c0dd", particleSize: 1, starSize: 1,
};
const VERT_DEFAULTS: TweakValues = {
  ...WIDE_DEFAULTS,
  streamCount: 24, thickness: 1.2, glow: 1.45, waveAmp: 0.6, particleDensity: 1.1, cloudDensity: 1,
};

/** every NeuralPathways prop, grouped — the panel is the complete prop surface */
const NP_ITEMS: TweakItem[] = [
  { key: "primary", label: "top color", type: "color", group: "color" },
  { key: "secondary", label: "bottom color", type: "color", group: "color" },
  { key: "crossTint", label: "color mix", type: "range", min: 0, max: 1, step: 0.05, group: "color" },
  { key: "streamCount", label: "strands", type: "range", min: 4, max: 40, step: 1, group: "streams" },
  { key: "heroStrands", label: "hero strands", type: "range", min: 0, max: 10, step: 1, group: "streams" },
  { key: "thickness", label: "thickness", type: "range", min: 0.3, max: 3, step: 0.05, group: "streams" },
  { key: "pulseLines", label: "line pulses", type: "toggle", group: "streams" },
  { key: "spread", label: "fan spread", type: "range", min: 0.04, max: 0.4, step: 0.005, group: "streams" },
  { key: "waveAmp", label: "wave amount", type: "range", min: 0, max: 1.5, step: 0.05, group: "wave" },
  { key: "waveFreq", label: "wave frequency", type: "range", min: 0.5, max: 6, step: 0.1, group: "wave" },
  { key: "focalX", label: "lens X", type: "range", min: 0.2, max: 0.8, step: 0.01, group: "lens" },
  { key: "focalY", label: "lens Y", type: "range", min: 0.25, max: 0.8, step: 0.01, group: "lens" },
  { key: "lensGap", label: "waist gap", type: "range", min: 0, max: 0.3, step: 0.005, group: "lens" },
  { key: "zoom", label: "warp zoom", type: "range", min: 0, max: 2.5, step: 0.05, group: "motion" },
  { key: "speed", label: "speed", type: "range", min: 0.1, max: 3, step: 0.05, group: "motion" },
  { key: "glow", label: "glow", type: "range", min: 0, max: 3, step: 0.05, group: "motion" },
  { key: "particleDensity", label: "particle count", type: "range", min: 0, max: 2, step: 0.05, group: "motion" },
  { key: "particleSize", label: "particle size", type: "range", min: 0.2, max: 3, step: 0.05, group: "motion" },
  { key: "starDensity", label: "star count", type: "range", min: 0, max: 2, step: 0.05, group: "motion" },
  { key: "starSize", label: "star size", type: "range", min: 0.2, max: 3, step: 0.05, group: "motion" },
  { key: "cloudPosition", label: "cloud position", type: "select", group: "clouds",
    options: [
      { value: "corners", label: "bottom corners" },
      { value: "bottom", label: "bottom band" },
      { value: "top", label: "top" },
      { value: "veil", label: "everywhere" },
    ] },
  { key: "cloudTint", label: "cloud color", type: "color", group: "clouds" },
  { key: "cloudDensity", label: "cloud density", type: "range", min: 0, max: 2, step: 0.05, group: "clouds" },
  { key: "cloudSpeed", label: "cloud speed", type: "range", min: 0, max: 4, step: 0.05, group: "clouds" },
  { key: "bgTop", label: "sky top", type: "color", group: "sky" },
  { key: "bgMid", label: "sky mid", type: "color", group: "sky" },
  { key: "bgBottom", label: "sky bottom", type: "color", group: "sky" },
  { key: "seed", label: "seed", type: "range", min: 0, max: 60, step: 1, group: "layers" },
  { key: "showClouds", label: "clouds / fog", type: "toggle", group: "layers" },
  { key: "showStars", label: "stars", type: "toggle", group: "layers" },
  { key: "showContent", label: "hero copy", type: "toggle", group: "layers" },
];

function useFadeUp(delay: number): React.CSSProperties {
  return {
    opacity: 0,
    animation: `sf-fade-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s forwards`,
  };
}

const Nav = () => (
  <nav
    style={useFadeUp(0.15)}
    className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-10 py-7 text-white/90"
  >
    <div className="text-lg font-bold tracking-[0.35em]">WEBCULES</div>
    <div className="hidden items-center gap-10 text-sm text-white/60 md:flex">
      <span>Work</span>
      <span>Services</span>
      <span>Pricing</span>
    </div>
    <div className="rounded-full border border-white/25 px-5 py-2 text-sm backdrop-blur-sm">Free preview</div>
  </nav>
);

const Features = () => (
  <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-white/55">
    {["See it before you pay", "Honest flat pricing", "AI-ready from day one"].map((f, i) => (
      <span key={f} style={useFadeUp(0.85 + i * 0.15)} className="flex items-center gap-2">
        <span className="text-white/80">›</span> {f}
      </span>
    ))}
  </div>
);

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
  const v = VARIANTS[variant] ?? VARIANTS.neural;
  const [cfg, setCfg] = useState<TweakValues>(() => ({
    ...WIDE_DEFAULTS,
    primary: v.primary,
    secondary: v.secondary,
  }));
  const [liveLayout, setLiveLayout] = useState(layout);
  const set = (key: string, val: TweakValues[string]) => setCfg((c) => ({ ...c, [key]: val }));
  const reroll = () => set("seed", Math.floor(Math.random() * 61));
  const useVariant = (name: string) => {
    const p = VARIANTS[name];
    if (!p) return;
    setCfg((c) => ({ ...c, primary: p.primary, secondary: p.secondary }));
  };

  // panel mode: live values everywhere; recording mode: tuned per-layout defaults (panel never appears)
  const base = panel ? cfg : liveLayout === "vertical" ? VERT_DEFAULTS : WIDE_DEFAULTS;
  const { showContent, ...np } = base; // showContent is demo UI, not a component prop
  const streams = { ...np, cloudImage: CLOUDS };
  const activeLayout = panel ? liveLayout : layout;
  const copy = showContent !== false;

  if (activeLayout === "vertical") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-[#04060d] font-sans" style={{ colorScheme: "dark" }}>
        <NeuralPathways className="absolute inset-0" primary={v.primary} secondary={v.secondary} {...streams} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(4,6,13,0.45),transparent_65%)]" />
        <div className="relative z-10 flex h-full flex-col items-center justify-between py-16 text-center">
          <p
            style={useFadeUp(0.25)}
            className="mx-auto max-w-[85%] text-[44px] font-semibold leading-[1.12] tracking-tight text-white"
          >
            {hook || "Your website has 3 seconds to make an impression."}
          </p>
          <div>
            <p style={useFadeUp(0.7)} className="text-[26px] font-bold tracking-[0.3em] text-white">
              WEBCULES
            </p>
            <p style={useFadeUp(0.9)} className="mt-3 text-[18px] text-white/60">
              Saskatoon · webcules.com
            </p>
          </div>
        </div>
        {panel && (
          <TweakPanel
            title="neural pathways"
            items={NP_ITEMS}
            value={cfg}
            onChange={set}
            extra={
              <PanelExtras cfg={cfg} setCfg={setCfg} liveLayout={liveLayout} setLiveLayout={setLiveLayout} reroll={reroll} useVariant={useVariant} />
            }
          />
        )}
        <style>{`@keyframes sf-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04060d] font-sans" style={{ colorScheme: "dark" }}>
      <NeuralPathways className="absolute inset-0" primary={v.primary} secondary={v.secondary} {...streams} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(4,6,13,0.5),transparent_60%)]" />
      {copy && (
        <>
          <Nav />
          <main className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center text-white">
            <h1 style={useFadeUp(0.3)} className="max-w-5xl text-[clamp(44px,6vw,84px)] font-semibold leading-[1.04] tracking-tight">
              Websites that stop
              <br />
              the scroll.
            </h1>
            <p style={useFadeUp(0.55)} className="mt-6 max-w-xl text-lg text-white/60">
              $10k-quality websites for Saskatoon businesses — see your redesign live before you pay a dollar.
            </p>
            <div style={useFadeUp(0.7)} className="mt-10">
              <span className="rounded-full bg-white/10 px-9 py-4 text-lg backdrop-blur-md ring-1 ring-white/25">
                Get your free preview →
              </span>
            </div>
            <Features />
            <p style={useFadeUp(1.3)} className="absolute bottom-8 text-sm text-white/40">
              Webcules Inc · Saskatoon, SK
            </p>
          </main>
        </>
      )}
      {panel && (
        <TweakPanel
          title="neural pathways"
          items={NP_ITEMS}
          value={cfg}
          onChange={set}
          extra={
            <PanelExtras cfg={cfg} setCfg={setCfg} liveLayout={liveLayout} setLiveLayout={setLiveLayout} reroll={reroll} useVariant={useVariant} />
          }
        />
      )}
      <style>{`@keyframes sf-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

function PanelExtras({
  cfg,
  setCfg,
  liveLayout,
  setLiveLayout,
  reroll,
  useVariant,
}: {
  cfg: TweakValues;
  setCfg: (fn: (c: TweakValues) => TweakValues) => void;
  liveLayout: string;
  setLiveLayout: (l: string) => void;
  reroll: () => void;
  useVariant: (name: string) => void;
}) {
  return (
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
            className={`flex-1 rounded px-2 py-1 font-mono ${cfg.primary === VARIANTS[name]!.primary ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
          >
            {name}
          </button>
        ))}
        <button onClick={reroll} className="rounded px-2 py-1 font-mono text-white/50 hover:text-white" title="re-roll seed">
          🎲
        </button>
      </div>
      <div className="font-mono text-white/40">copy config → paste into social.project.json or hand it back</div>
    </div>
  );
}
