import type { Metadata } from "next";

import { WildcodeField } from "@webcules/ui/components/wildcode-field";

import { CodeBlock } from "@/components/wildcode-docs/code-block";
import { InstallTabs } from "@/components/wildcode-docs/install-tabs";
import { WildcodePlayground } from "@/components/wildcode-docs/wildcode-playground";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "WildcodeField — Webcules Components",
  description:
    "A living wordmark: hand-animated canvas scene that blooms inside your lettering. React component, copy-paste ready.",
};

const USAGE = `import { WildcodeField } from "@webcules/ui/components/wildcode-field";

export function Hero() {
  return (
    <WildcodeField
      phrase="Start today"
      letterColor="#5839a8"
      spriteSet="flowers"   // flowers | stars | bubbles | hearts
      critterStyle="drone"  // drone | bee | ghost
      className="my-8"
    />
  );
}`;

const CLIPPED = `// Tines-style: objects only exist inside the letter shapes
<WildcodeField
  phrase="Grow with us"
  spriteSet="stars"
  letterColor="#1d7a8c"
  clipFlowers
  seed={12}
/>`;

const PROPS: { name: string; type: string; def: string; desc: string }[] = [
  { name: "phrase", type: "string", def: '"Start today"', desc: "The wordmark text. Auto-fits, wraps, and rebuilds on change." },
  { name: "letterColor", type: "string", def: '"#5839a8"', desc: "Fill color of the base letters." },
  { name: "spriteSet", type: '"flowers" | "stars" | "bubbles" | "hearts"', def: '"flowers"', desc: "Which object grows inside the letters." },
  { name: "critterStyle", type: '"drone" | "bee" | "ghost"', def: '"drone"', desc: "The roaming critters that carry the paint glows." },
  { name: "clipFlowers", type: "boolean", def: "false", desc: "Clip objects to the letter shapes. false lets them spill past the edges." },
  { name: "hoverRecolor", type: "boolean", def: "true", desc: "Hovering an object recolors it to a random palette family." },
  { name: "seed", type: "number", def: "7", desc: "Deterministic layouts: same seed, same garden." },
  { name: "beamDur / holdDur", type: "number", def: "6 / 5", desc: "Seconds for the grow sweep and the full-bloom hold." },
  { name: "flowerDensity", type: "number", def: "1", desc: "Multiplier on how many objects get placed." },
  { name: "vineCount / droneCount", type: "number", def: "26 / 4", desc: "How many vines grow and critters roam." },
  { name: "sway", type: "number", def: "0.14", desc: "Sway amplitude in radians." },
];

export default function WildcodeFieldPage() {
  return (
    <div>
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">WildcodeField</h1>
        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2.5 py-0.5 text-xs text-fuchsia-300">
          canvas
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/60">
          client component
        </span>
      </div>
      <p className="mb-10 max-w-2xl text-white/60">
        A living wordmark: hand-lettered shapes become a stencil while flowers,
        vines and little critters grow through them — revealed by a paint beam
        that follows your pointer. The whole scene is a single imperative canvas;
        React never re-renders it.
      </p>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Installation</h2>
        <InstallTabs siteUrl={SITE_URL} />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Playground</h2>
        <WildcodePlayground />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Usage</h2>
        <CodeBlock code={USAGE} title="hero.tsx" />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">
          Example — clipped inside the letters
        </h2>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#f3f7f7]">
          <WildcodeField
            phrase="Grow with us"
            spriteSet="stars"
            critterStyle="bee"
            letterColor="#1d7a8c"
            clipFlowers
            seed={12}
            className="rounded-2xl"
          />
        </div>
        <div className="mt-4">
          <CodeBlock code={CLIPPED} title="clipped.tsx" />
        </div>
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
            Accessibility: the region is <code className="font-mono text-white/80">role=&quot;img&quot;</code> with
            an aria-label, and <code className="font-mono text-white/80">prefers-reduced-motion</code> renders a
            static full-bloom frame instead of animating.
          </li>
          <li>
            Performance: sprites are prerendered once, layers redraw only when
            dirty, and the loop pauses when scrolled offscreen.
          </li>
          <li>
            The pointer replaces the native cursor over the wordmark — keep that
            in mind when layering clickable content inside it.
          </li>
        </ul>
      </section>
    </div>
  );
}
