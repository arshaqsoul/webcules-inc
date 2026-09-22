"use client";

import React, { useState } from "react";
import { NeuralPathways } from "@webcules/ui/components/ui/neural-pathways";

const VARIANTS: Record<string, { primary: string; secondary: string }> = {
  neural: { primary: "#f5b04c", secondary: "#3fb6ff" },
  aurora: { primary: "#34d399", secondary: "#a78bfa" },
  synapse: { primary: "#fb7185", secondary: "#7dd3fc" },
};

type Values = Record<string, number | boolean | string>;

const DEFAULTS: Values = {
  streamCount: 22,
  thickness: 1.2,
  waveAmp: 0.6,
  glow: 1.35,
  speed: 1.1,
  zoom: 1,
  pulseLines: true,
  cloudDensity: 1,
};

const SLIDERS: { key: string; label: string; min: number; max: number; step: number }[] = [
  { key: "waveAmp", label: "whip", min: 0, max: 1.5, step: 0.05 },
  { key: "glow", label: "glow", min: 0, max: 3, step: 0.05 },
  { key: "speed", label: "speed", min: 0.2, max: 3, step: 0.05 },
  { key: "zoom", label: "warp", min: 0, max: 2.5, step: 0.05 },
  { key: "streamCount", label: "strands", min: 6, max: 40, step: 1 },
  { key: "cloudDensity", label: "fog", min: 0, max: 2, step: 0.05 },
];

const accent = { accentColor: "#6c5ce7" } as const;

/** Live NeuralPathways demo with variant presets and the most-played knobs. */
export function NeuralPathwaysPlayground() {
  const [variant, setVariant] = useState("neural");
  const [cfg, setCfg] = useState<Values>(DEFAULTS);
  const set = (key: string, v: Values[string]) => setCfg((c) => ({ ...c, [key]: v }));
  const v = VARIANTS[variant] ?? VARIANTS.neural;

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#04060d]">
        <div className="relative h-[480px] w-full">
          <NeuralPathways
            className="absolute inset-0"
            primary={v.primary}
            secondary={v.secondary}
            streamCount={Number(cfg.streamCount)}
            thickness={1.2}
            heroStrands={4}
            waveAmp={Number(cfg.waveAmp)}
            waveFreq={2.4}
            lensGap={0.075}
            crossTint={0.38}
            glow={Number(cfg.glow)}
            speed={Number(cfg.speed)}
            zoom={Number(cfg.zoom)}
            particleDensity={1.1}
            cloudDensity={Number(cfg.cloudDensity)}
            pulseLines={Boolean(cfg.pulseLines)}
            cloudPosition="corners"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(4,6,13,0.4),transparent_62%)]" />
          <div className="absolute inset-x-0 top-0 flex justify-center pt-8">
            <p className="text-2xl font-semibold tracking-tight text-white/90">
              Websites that stop the scroll.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {Object.keys(VARIANTS).map((name) => (
            <button
              key={name}
              onClick={() => setVariant(name)}
              className={`rounded px-3 py-1 font-mono text-xs transition-colors ${
                variant === name ? "bg-white/20 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={Boolean(cfg.pulseLines)}
            onChange={(e) => set("pulseLines", e.target.checked)}
            style={accent}
          />
          line pulses
        </label>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {SLIDERS.map((s) => (
          <label key={s.key} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 text-white/60">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={Number(cfg[s.key])}
              onChange={(e) => set(s.key, Number(e.target.value))}
              style={accent}
              className="h-1 flex-1 cursor-pointer appearance-none rounded bg-white/20"
            />
            <span className="w-9 text-right font-mono text-white/70">
              {Number(cfg[s.key]).toFixed(s.step < 0.1 ? 2 : 1)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default NeuralPathwaysPlayground;
