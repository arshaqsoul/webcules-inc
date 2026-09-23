import React, { useState } from "react";
import { SilkAurora } from "@webcules/ui/components/ui/silk-aurora";
import { TweakPanel, type TweakItem, type TweakValues } from "../components/TweakPanel";

export const meta = {
  slug: "silk-aurora",
  title: "Silk Aurora",
  component: "silk-aurora",
  description: "Flowing silk ribbons of gradient light — ?panel=1 exposes every prop live",
};

type VariantDef = TweakValues & { dark: boolean };

const VARIANTS: Record<string, VariantDef> = {
  "sunset-silk": {
    c0: "#ff8a3d", c1: "#e2314d", c2: "#9333ea", c3: "#818cf8",
    background: "#ffffff", blend: "normal", dark: false,
  },
  "chrome-glass": {
    c0: "#0e2a38", c1: "#2b6777", c2: "#9fc4d0", c3: "#e8f1f4",
    background: "#f4f5f7", blend: "multiply", softness: 0.45, sheen: 0.85, count: 3, dark: false,
  },
  "midnight-nebula": {
    c0: "#7c3aed", c1: "#4f46e5", c2: "#c4b5fd", c3: "#f59e0b",
    background: "#050508", blend: "screen", intensity: 0.9, count: 3, grain: 0.15, dark: true,
  },
};

/** tuned defaults per layout (recordings use these — the panel only overrides when ?panel=1) */
const WIDE_DEFAULTS: TweakValues = {
  count: 2, orientation: -35, curvature: 0.55, amplitude: 0.5, width: 0.5, length: 1.25,
  scale: 1, oX: 0.5, oY: 0.52, speed: 1, drift: 0.7, intensity: 0.85, softness: 0.55,
  blend: "normal", sheen: 0.5, grain: 0, interactive: false, seed: 1, showContent: true,
};
const VERT_DEFAULTS: TweakValues = {
  ...WIDE_DEFAULTS,
  curvature: 0.6, amplitude: 0.6, width: 0.55, intensity: 0.9,
};

/** every SilkAurora prop, grouped — the panel is the complete prop surface */
const SILK_ITEMS: TweakItem[] = [
  { key: "c0", label: "color stop 1", type: "color", group: "palette" },
  { key: "c1", label: "color stop 2", type: "color", group: "palette" },
  { key: "c2", label: "color stop 3", type: "color", group: "palette" },
  { key: "c3", label: "color stop 4", type: "color", group: "palette" },
  { key: "background", label: "backdrop", type: "color", group: "palette" },
  { key: "blend", label: "blend", type: "select", group: "palette",
    options: [
      { value: "normal", label: "normal" },
      { value: "multiply", label: "multiply (ink on light)" },
      { value: "screen", label: "screen (glow on dark)" },
      { value: "overlay", label: "overlay" },
    ] },
  { key: "count", label: "ribbons", type: "range", min: 1, max: 6, step: 1, group: "shape" },
  { key: "orientation", label: "tilt (deg)", type: "range", min: -90, max: 90, step: 1, group: "shape" },
  { key: "curvature", label: "curvature", type: "range", min: 0, max: 1, step: 0.05, group: "shape" },
  { key: "width", label: "thickness", type: "range", min: 0.1, max: 1, step: 0.05, group: "shape" },
  { key: "length", label: "length", type: "range", min: 0.4, max: 1.5, step: 0.05, group: "shape" },
  { key: "scale", label: "zoom", type: "range", min: 0.5, max: 2, step: 0.05, group: "shape" },
  { key: "oX", label: "origin X", type: "range", min: 0, max: 1, step: 0.01, group: "shape" },
  { key: "oY", label: "origin Y", type: "range", min: 0, max: 1, step: 0.01, group: "shape" },
  { key: "speed", label: "speed", type: "range", min: 0, max: 3, step: 0.05, group: "motion" },
  { key: "drift", label: "drift", type: "range", min: 0, max: 1, step: 0.05, group: "motion" },
  { key: "amplitude", label: "breathing", type: "range", min: 0, max: 1, step: 0.05, group: "motion" },
  { key: "interactive", label: "pointer lean", type: "toggle", group: "motion" },
  { key: "intensity", label: "intensity", type: "range", min: 0, max: 1, step: 0.05, group: "finish" },
  { key: "softness", label: "softness", type: "range", min: 0, max: 1, step: 0.05, group: "finish" },
  { key: "sheen", label: "sheen (fold)", type: "range", min: 0, max: 1, step: 0.05, group: "finish" },
  { key: "grain", label: "grain", type: "range", min: 0, max: 1, step: 0.05, group: "finish" },
  { key: "seed", label: "seed", type: "range", min: 1, max: 99, step: 1, group: "finish" },
  { key: "showContent", label: "hero copy", type: "toggle", group: "layers" },
];

function useFadeUp(delay: number): React.CSSProperties {
  return {
    opacity: 0,
    animation: `sf-fade-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s forwards`,
  };
}

const Features = ({ ink }: { ink: string }) => (
  <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm" style={{ color: ink }}>
    {["See it before you pay", "Honest flat pricing", "AI-ready from day one"].map((f, i) => (
      <span key={f} style={useFadeUp(0.85 + i * 0.15)} className="flex items-center gap-2 opacity-70">
        <span className="opacity-100">›</span> {f}
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
  const v = VARIANTS[variant] ?? VARIANTS["sunset-silk"]!;
  const [cfg, setCfg] = useState<TweakValues>(() => ({
    ...WIDE_DEFAULTS,
    ...v,
  }));
  const [liveLayout, setLiveLayout] = useState(layout);
  const set = (key: string, val: TweakValues[string]) => setCfg((c) => ({ ...c, [key]: val }));
  const reroll = () => set("seed", Math.floor(Math.random() * 99) + 1);
  const useVariant = (name: string) => {
    const p = VARIANTS[name];
    if (!p) return;
    setCfg((c) => ({ ...c, ...p }));
  };

  // panel mode: live values everywhere; recording mode: tuned per-layout defaults (panel never appears)
  const base = panel ? cfg : liveLayout === "vertical" ? { ...VERT_DEFAULTS, ...v } : { ...WIDE_DEFAULTS, ...v };
  const { showContent, dark, c0, c1, c2, c3, oX, oY, ...silk } = base; // demo-only keys stripped
  const silkProps = {
    ...silk,
    colors: [c0, c1, c2, c3].filter((x): x is string => typeof x === "string" && x.length > 0),
    origin: { x: Number(oX ?? 0.5), y: Number(oY ?? 0.5) },
  };
  const activeLayout = panel ? liveLayout : layout;
  const copy = showContent !== false;
  const ink = dark ? "#ffffff" : "#171717";
  const inkSub = dark ? "rgba(255,255,255,0.64)" : "rgba(23,23,23,0.62)";
  const whiteBg = !dark && String(silk.background).toLowerCase() === "#ffffff";

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
            className={`flex-1 rounded px-2 py-1 font-mono text-[10px] ${cfg.c0 === VARIANTS[name]!.c0 && cfg.background === VARIANTS[name]!.background ? "bg-white/20 text-white" : "text-white/50 hover:text-white"}`}
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

  if (activeLayout === "vertical") {
    return (
      <div className="fixed inset-0 overflow-hidden font-sans" style={{ backgroundColor: String(silk.background), colorScheme: dark ? "dark" : "light" }}>
        <SilkAurora className="absolute inset-0" {...silkProps} />
        <div
          className="absolute inset-0"
          style={{
            background: dark
              ? "radial-gradient(ellipse at center, rgba(5,5,8,0.45), transparent 65%)"
              : "radial-gradient(ellipse at center, rgba(255,255,255,0.35), transparent 65%)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col items-center justify-between py-16 text-center">
          <p
            style={{ ...useFadeUp(0.25), color: ink }}
            className="mx-auto max-w-[85%] text-[44px] font-semibold leading-[1.12] tracking-tight"
          >
            {hook || "Your hero deserves weather."}
          </p>
          <div>
            <p style={{ ...useFadeUp(0.7), color: ink }} className="text-[26px] font-bold tracking-[0.3em]">
              WEBCULES
            </p>
            <p style={{ ...useFadeUp(0.9), color: inkSub }} className="mt-3 text-[18px]">
              Saskatoon · webcules.com
            </p>
          </div>
        </div>
        {panel && (
          <TweakPanel title="silk aurora" items={SILK_ITEMS} value={cfg} onChange={set} extra={PanelExtras} />
        )}
        <style>{`@keyframes sf-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden font-sans" style={{ backgroundColor: String(silk.background), colorScheme: dark ? "dark" : "light" }}>
      <SilkAurora className="absolute inset-0" {...silkProps} />
      {!whiteBg && <div className="absolute inset-0" style={{ background: dark ? "radial-gradient(ellipse at center, rgba(5,5,8,0.5), transparent 60%)" : "radial-gradient(ellipse at center, rgba(244,245,247,0.45), transparent 60%)" }} />}
      {copy && (
        <>
          <nav
            style={{ ...useFadeUp(0.15), color: ink }}
            className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-10 py-7"
          >
            <div className="text-lg font-bold tracking-[0.35em]">WEBCULES</div>
            <div className="hidden items-center gap-10 text-sm opacity-60 md:flex">
              <span>Work</span>
              <span>Services</span>
              <span>Pricing</span>
            </div>
            <div className="rounded-full border px-5 py-2 text-sm backdrop-blur-sm" style={{ borderColor: dark ? "rgba(255,255,255,0.25)" : "rgba(23,23,23,0.2)" }}>
              Free preview
            </div>
          </nav>
          <main className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center">
            <h1 style={{ ...useFadeUp(0.3), color: ink }} className="max-w-5xl text-[clamp(44px,6vw,84px)] font-semibold leading-[1.04] tracking-tight">
              Websites that breathe.
            </h1>
            <p style={{ ...useFadeUp(0.55), color: inkSub }} className="mt-6 max-w-xl text-lg">
              $10k-quality websites for Saskatoon businesses — see your redesign live before you pay a dollar.
            </p>
            <div style={useFadeUp(0.7)} className="mt-10">
              <span
                className="rounded-full border px-9 py-4 text-lg backdrop-blur-md"
                style={{
                  color: ink,
                  backgroundColor: dark ? "rgba(255,255,255,0.1)" : "rgba(23,23,23,0.06)",
                  borderColor: dark ? "rgba(255,255,255,0.25)" : "rgba(23,23,23,0.15)",
                }}
              >
                Get your free preview →
              </span>
            </div>
            <Features ink={inkSub} />
            <p style={{ ...useFadeUp(1.3), color: inkSub }} className="absolute bottom-8 text-sm">
              Webcules Inc · Saskatoon, SK
            </p>
          </main>
        </>
      )}
      {panel && (
        <TweakPanel title="silk aurora" items={SILK_ITEMS} value={cfg} onChange={set} extra={PanelExtras} />
      )}
      <style>{`@keyframes sf-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
