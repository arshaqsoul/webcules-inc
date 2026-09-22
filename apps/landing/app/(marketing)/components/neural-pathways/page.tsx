import type { Metadata } from "next";

import { NeuralPathways } from "@webcules/ui/components/ui/neural-pathways";

import { CodeBlock } from "@/components/wildcode-docs/code-block";
import { InstallTabs } from "@/components/wildcode-docs/install-tabs";
import { NeuralPathwaysPlayground } from "@/components/wildcode-docs/neural-pathways-playground";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "NeuralPathways — Webcules Components",
  description:
    "Dual-waist light-stream lens: duotone filament wings whip inward through procedural scene-lit fog. Pure SVG + CSS motion, zero dependencies.",
};

const USAGE = `import { NeuralPathways } from "@webcules/ui/components/ui/neural-pathways";

export function Hero() {
  return (
    <section className="relative h-screen overflow-hidden">
      <NeuralPathways className="absolute inset-0" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-white">
        <h1>Websites that stop the scroll.</h1>
        <a href="/contact">Get your free preview →</a>
      </div>
    </section>
  );
}`;

const RECOLOR = `// recolor: emerald top wing, violet bottom wing, stronger blend near the lens
<NeuralPathways
  primary="#34d399"
  secondary="#a78bfa"
  crossTint={0.4}
  cloudTint="#cdb9f5"
/>`;

const CALM = `// continuous lines, no pulses — whip wave + fog carry the motion
<NeuralPathways pulseLines={false} zoom={0.4} cloudPosition="bottom" />`;

const PROPS: { name: string; type: string; def: string; desc: string }[] = [
  { name: "primary", type: "string", def: '"#f5b04c"', desc: "Stream color of the two top wings." },
  { name: "secondary", type: "string", def: '"#3fb6ff"', desc: "Stream color of the two bottom wings." },
  { name: "crossTint", type: "number", def: "0.35", desc: "How much the opposite color bleeds into strands near the lens (0–1)." },
  { name: "streamCount", type: "number", def: "18", desc: "Filament strands per wing." },
  { name: "heroStrands", type: "number", def: "3", desc: "Thicker, brighter strands per wing." },
  { name: "thickness", type: "number", def: "1", desc: "Stroke width multiplier." },
  { name: "spread", type: "number", def: "0.135", desc: "Fan width of the bundle at the corners." },
  { name: "waveAmp", type: "number", def: "0.5", desc: "Traveling whip-wave amplitude (0 = straight strands)." },
  { name: "waveFreq", type: "number", def: "2.2", desc: "Whip-wave frequency along each strand." },
  { name: "focalX / focalY", type: "number", def: "0.5 / 0.535", desc: "Lens center, 0–1 of the canvas." },
  { name: "lensGap", type: "number", def: "0.075", desc: "Vertical gap between the two waists." },
  { name: "zoom", type: "number", def: "1", desc: "Warp throttle: light pulses + particle speed. 0 = still." },
  { name: "pulseLines", type: "boolean", def: "true", desc: "Bright pulses racing along the strands. false = solid lines." },
  { name: "glow", type: "number", def: "1", desc: "Bloom strength." },
  { name: "speed", type: "number", def: "1", desc: "Global motion multiplier." },
  { name: "particleDensity", type: "number", def: "1", desc: "Sparks streaming into the lens (0–2)." },
  { name: "particleSize", type: "number", def: "1", desc: "Spark size multiplier." },
  { name: "starDensity / starSize", type: "number", def: "1", desc: "Background dust field count / size." },
  { name: "showClouds", type: "boolean", def: "true", desc: "Fog layer on/off." },
  { name: "cloudDensity", type: "number", def: "0.8", desc: "Fog density." },
  { name: "cloudSpeed", type: "number", def: "1", desc: "Fog drift speed." },
  { name: "cloudPosition", type: '"corners" | "bottom" | "top" | "veil"', def: '"corners"', desc: "Where the fog banks sit." },
  { name: "cloudTint", type: "string", def: '"#a8c0dd"', desc: "Base fog color (lit gold/blue by the waists)." },
  { name: "cloudImage", type: "string", def: "—", desc: "Optional texture URL for the no-WebGL fallback banks." },
  { name: "seed", type: "number", def: "7", desc: "Deterministic variation — re-roll the fan." },
  { name: "bgTop / bgMid / bgBottom", type: "string", def: 'navy ramp', desc: "Sky gradient colors." },
];

export default function NeuralPathwaysPage() {
  return (
    <div>
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">NeuralPathways</h1>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-300">
          svg
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/60">
          client component
        </span>
      </div>
      <p className="mb-10 max-w-2xl text-white/60">
        Two duotone wings of light filaments pour in from the corners, whip inward,
        and pinch through a glowing lens behind your call-to-action — over
        procedural fog banks lit by the streams themselves. Pure SVG geometry and
        CSS motion with one WebGL fog pass; zero runtime dependencies.
      </p>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Installation</h2>
        <InstallTabs siteUrl={SITE_URL} name="neural-pathways" />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Playground</h2>
        <NeuralPathwaysPlayground />
        <p className="mt-3 text-sm text-white/40">
          The full 25-prop control panel lives in the demo gallery:
          <span className="font-mono text-white/60"> /demo/neural-pathways?panel=1</span>
        </p>
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Usage</h2>
        <CodeBlock code={USAGE} title="hero.tsx" />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Example — aurora recolor</h2>
        <div className="relative h-64 overflow-hidden rounded-2xl border border-white/10 bg-[#04060d]">
          <NeuralPathways
            className="absolute inset-0"
            primary="#34d399"
            secondary="#a78bfa"
            streamCount={18}
            waveAmp={0.5}
            glow={1.2}
            cloudDensity={0.7}
          />
        </div>
        <div className="mt-4">
          <CodeBlock code={RECOLOR} title="recolor.tsx" />
        </div>
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Example — calm continuous lines</h2>
        <p className="mb-4 text-sm leading-relaxed text-white/55">
          Set <code className="font-mono text-white/80">pulseLines={"{"}false{"}"}</code> for solid
          continuous strands — the traveling whip-wave and fog carry the motion instead.
        </p>
        <CodeBlock code={CALM} title="calm.tsx" />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Props</h2>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">Prop</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Default</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {PROPS.map((p) => (
                <tr key={p.name} className="align-top">
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-white">
                    {p.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-violet-300/80">
                    {p.type}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-white/50">
                    {p.def}
                  </td>
                  <td className="px-4 py-3 text-white/70">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Notes</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-white/60">
          <li>
            Accessibility: the component is <code className="font-mono text-white/80">aria-hidden</code> and
            purely decorative — sit your content on top. Under{" "}
            <code className="font-mono text-white/80">prefers-reduced-motion</code> it renders one
            settled static frame instead of animating.
          </li>
          <li>
            Performance: strand geometry is computed once per size (ResizeObserver), all line
            motion is CSS/SMIL, and the fog is a half-resolution WebGL pass — no per-frame JS
            on the main thread.
          </li>
          <li>
            Fog needs WebGL; without it the component falls back to SVG turbulence clouds
            (optionally a texture via <code className="font-mono text-white/80">cloudImage</code>) with the same API.
          </li>
          <li>
            Tune it live: the demo gallery exposes every prop at{" "}
            <code className="font-mono text-white/80">/demo/neural-pathways?panel=1</code> — copy the
            config JSON and paste it as props.
          </li>
        </ul>
      </section>
    </div>
  );
}
