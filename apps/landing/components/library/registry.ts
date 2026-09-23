/* Component registry — the single source of truth for the components
 * playground. Drives the left toolbox controls, the live preview, the props
 * tables and the "copy code / copy config" snippets. Edit here; the docs
 * pages render from it.
 *
 * `library.json` / `manifest.gen.ts` stays the forge-side manifest (what
 * exists, previews, phases); this file describes how each component is
 * configured and documented. */

import type { ConfigValues } from "@/lib/saved-configs";

export type Control =
  | { kind: "select"; options: { value: string; label: string }[] }
  | { kind: "color" }
  /** Multi-stop color picker — value is a comma-separated hex string. */
  | { kind: "colors" }
  | { kind: "slider"; min: number; max: number; step: number }
  | { kind: "boolean" }
  | { kind: "text" };

export type PropSpec = {
  /** Component prop name (exact, as passed in JSX). */
  prop: string;
  /** Human label in the toolbox. */
  label: string;
  /** Display type string for the props table. */
  type: string;
  control: Control;
  default: ConfigValues[string];
  /** Toolbox group heading. */
  group: string;
  /** One-liner for the props table. */
  description: string;
};

export type ExampleDoc = {
  title: string;
  description?: string;
  code: string;
};

export type ComponentDocs = {
  /** Full usage snippet (import + example). */
  usage: string;
  /** Bullet list shown right under the intro. */
  highlights?: string[];
  examples?: ExampleDoc[];
  notes?: string[];
};

export type RegistryEntry = {
  /** Slug — matches library.json `name`. */
  name: string;
  /** Component export name. */
  importName: string;
  /** Import path shown in snippets. */
  importPath: string;
  docs: ComponentDocs;
  props: PropSpec[];
};

const BOOL = { kind: "boolean" } as const;
const slider = (min: number, max: number, step: number) => ({ kind: "slider" as const, min, max, step });
const select = (options: string[]) => ({
  kind: "select" as const,
  options: options.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) })),
});

/* -------------------------------------------------------------------------- */
/* WildcodeField                                                              */
/* -------------------------------------------------------------------------- */

const WILDCODE_FIELD: RegistryEntry = {
  name: "wildcode-field",
  importName: "WildcodeField",
  importPath: "@webcules/ui/components/wildcode-field",
  props: [
    { prop: "phrase", label: "Phrase", type: "string", control: { kind: "text" }, default: "Start today", group: "Content", description: "The wordmark text. Auto-fits, wraps, and rebuilds on change." },
    { prop: "letterColor", label: "Letter color", type: "string", control: { kind: "color" }, default: "#5839a8", group: "Content", description: "Fill color of the base letters." },
    { prop: "spriteSet", label: "Objects", type: '"flowers" | "stars" | "bubbles" | "hearts"', control: select(["flowers", "stars", "bubbles", "hearts"]), default: "flowers", group: "Content", description: "Which object grows inside the letters." },
    { prop: "critterStyle", label: "Critters", type: '"drone" | "bee" | "ghost"', control: select(["drone", "bee", "ghost"]), default: "drone", group: "Content", description: "The roaming critters that carry the paint glows." },
    { prop: "clipFlowers", label: "Clip in letters", type: "boolean", control: BOOL, default: false, group: "Content", description: "Clip objects to the letter shapes. false lets them spill past the edges." },
    { prop: "hoverRecolor", label: "Hover recolor", type: "boolean", control: BOOL, default: true, group: "Content", description: "Hovering an object recolors it to a random palette family." },
    { prop: "seed", label: "Seed", type: "number", control: slider(1, 99, 1), default: 7, group: "Growth", description: "Deterministic layouts: same seed, same garden." },
    { prop: "flowerDensity", label: "Density", type: "number", control: slider(0.2, 3, 0.05), default: 1, group: "Growth", description: "Multiplier on how many objects get placed." },
    { prop: "vineCount", label: "Vines", type: "number", control: slider(0, 60, 1), default: 26, group: "Growth", description: "How many vines grow." },
    { prop: "droneCount", label: "Critter count", type: "number", control: slider(0, 12, 1), default: 4, group: "Growth", description: "How many critters roam." },
    { prop: "sway", label: "Sway", type: "number", control: slider(0, 0.5, 0.01), default: 0.14, group: "Growth", description: "Sway amplitude in radians." },
    { prop: "beamDur", label: "Grow time", type: "number", control: slider(2, 14, 0.5), default: 6, group: "Growth", description: "Seconds for the grow sweep." },
    { prop: "holdDur", label: "Hold time", type: "number", control: slider(1, 14, 0.5), default: 5, group: "Growth", description: "Seconds for the full-bloom hold." },
  ],
  docs: {
    highlights: [
      "Hand-lettered shapes become a stencil while flowers, vines and little critters grow through them",
      "A paint beam reveals the bloom — and your pointer is a second beam; click for shockwaves",
      "The whole scene is a single imperative canvas; React never re-renders it",
      "role=\"img\" with aria-label, and prefers-reduced-motion renders a static full-bloom frame",
    ],
    usage: `import { WildcodeField } from "@webcules/ui/components/wildcode-field";

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
}`,
    examples: [
      {
        title: "Clipped inside the letters",
        description:
          "Tines-style: objects only exist inside the letter shapes — set the same knobs in the toolbox to preview it live.",
        code: `<WildcodeField
  phrase="Grow with us"
  spriteSet="stars"
  letterColor="#1d7a8c"
  clipFlowers
  seed={12}
/>`,
      },
    ],
    notes: [
      "Performance: sprites are prerendered once, layers redraw only when dirty, and the loop pauses when scrolled offscreen.",
      "The pointer replaces the native cursor over the wordmark — keep that in mind when layering clickable content inside it.",
      "The cycle runs GROW → HOLD → RETRACT → REST; restart it any time from the toolbox.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* NeuralPathways                                                             */
/* -------------------------------------------------------------------------- */

const NEURAL_PATHWAYS: RegistryEntry = {
  name: "neural-pathways",
  importName: "NeuralPathways",
  importPath: "@webcules/ui/components/ui/neural-pathways",
  props: [
    { prop: "primary", label: "Top wing", type: "string", control: { kind: "color" }, default: "#f5b04c", group: "Streams", description: "Stream color of the two top wings." },
    { prop: "secondary", label: "Bottom wing", type: "string", control: { kind: "color" }, default: "#3fb6ff", group: "Streams", description: "Stream color of the two bottom wings." },
    { prop: "crossTint", label: "Cross-tint", type: "number", control: slider(0, 1, 0.05), default: 0.35, group: "Streams", description: "How much the opposite color bleeds into strands near the lens (0–1)." },
    { prop: "streamCount", label: "Strands", type: "number", control: slider(6, 40, 1), default: 18, group: "Streams", description: "Filament strands per wing." },
    { prop: "heroStrands", label: "Hero strands", type: "number", control: slider(0, 8, 1), default: 3, group: "Streams", description: "Thicker, brighter strands per wing." },
    { prop: "thickness", label: "Thickness", type: "number", control: slider(0.25, 3, 0.05), default: 1, group: "Streams", description: "Stroke width multiplier." },
    { prop: "spread", label: "Spread", type: "number", control: slider(0, 0.4, 0.005), default: 0.135, group: "Streams", description: "Fan width of the bundle at the corners." },
    { prop: "waveAmp", label: "Whip wave", type: "number", control: slider(0, 1.5, 0.05), default: 0.5, group: "Motion", description: "Traveling whip-wave amplitude (0 = straight strands)." },
    { prop: "waveFreq", label: "Wave freq", type: "number", control: slider(0.5, 5, 0.1), default: 2.2, group: "Motion", description: "Whip-wave frequency along each strand." },
    { prop: "zoom", label: "Warp", type: "number", control: slider(0, 2.5, 0.05), default: 1, group: "Motion", description: "Warp throttle: light pulses + particle speed. 0 = still." },
    { prop: "pulseLines", label: "Line pulses", type: "boolean", control: BOOL, default: true, group: "Motion", description: "Bright pulses racing along the strands. false = solid lines." },
    { prop: "glow", label: "Glow", type: "number", control: slider(0, 3, 0.05), default: 1, group: "Motion", description: "Bloom strength." },
    { prop: "speed", label: "Speed", type: "number", control: slider(0, 3, 0.05), default: 1, group: "Motion", description: "Global motion multiplier." },
    { prop: "focalX", label: "Focal X", type: "number", control: slider(0, 1, 0.01), default: 0.5, group: "Lens", description: "Lens center X, 0–1 of the canvas." },
    { prop: "focalY", label: "Focal Y", type: "number", control: slider(0, 1, 0.01), default: 0.535, group: "Lens", description: "Lens center Y, 0–1 of the canvas." },
    { prop: "lensGap", label: "Lens gap", type: "number", control: slider(0.01, 0.3, 0.005), default: 0.075, group: "Lens", description: "Vertical gap between the two waists." },
    { prop: "particleDensity", label: "Sparks", type: "number", control: slider(0, 2, 0.05), default: 1, group: "Particles", description: "Sparks streaming into the lens (0–2)." },
    { prop: "particleSize", label: "Spark size", type: "number", control: slider(0.25, 3, 0.05), default: 1, group: "Particles", description: "Spark size multiplier." },
    { prop: "starDensity", label: "Star density", type: "number", control: slider(0, 3, 0.05), default: 1, group: "Particles", description: "Background dust field count." },
    { prop: "starSize", label: "Star size", type: "number", control: slider(0.25, 3, 0.05), default: 1, group: "Particles", description: "Background dust size multiplier." },
    { prop: "showClouds", label: "Fog on/off", type: "boolean", control: BOOL, default: true, group: "Fog", description: "Fog layer on/off." },
    { prop: "cloudDensity", label: "Fog density", type: "number", control: slider(0, 2, 0.05), default: 0.8, group: "Fog", description: "Fog density." },
    { prop: "cloudSpeed", label: "Fog speed", type: "number", control: slider(0, 3, 0.05), default: 1, group: "Fog", description: "Fog drift speed." },
    { prop: "cloudPosition", label: "Fog position", type: '"corners" | "bottom" | "top" | "veil"', control: select(["corners", "bottom", "top", "veil"]), default: "corners", group: "Fog", description: "Where the fog banks sit." },
    { prop: "cloudTint", label: "Fog tint", type: "string", control: { kind: "color" }, default: "#a8c0dd", group: "Fog", description: "Base fog color (lit gold/blue by the waists)." },
    { prop: "seed", label: "Seed", type: "number", control: slider(1, 99, 1), default: 7, group: "Sky", description: "Deterministic variation — re-roll the fan." },
    { prop: "bgTop", label: "Sky top", type: "string", control: { kind: "color" }, default: "#04060d", group: "Sky", description: "Sky gradient top color." },
    { prop: "bgMid", label: "Sky mid", type: "string", control: { kind: "color" }, default: "#0a1024", group: "Sky", description: "Sky gradient mid color (at 62% height)." },
    { prop: "bgBottom", label: "Sky bottom", type: "string", control: { kind: "color" }, default: "#101a38", group: "Sky", description: "Sky gradient bottom color." },
  ],
  docs: {
    highlights: [
      "Dual-waist light-stream lens: duotone filament wings whip inward and pinch through a glowing core",
      "Procedural fog banks (WebGL FBM) lit by the wing colors — SVG turbulence fallback when WebGL is unavailable",
      "Pure SVG geometry + CSS motion: zero runtime dependencies, deterministic rendering",
      "aria-hidden and purely decorative — sit your content on top of it",
    ],
    usage: `import { NeuralPathways } from "@webcules/ui/components/ui/neural-pathways";

export function Hero() {
  return (
    <section className="relative h-screen overflow-hidden">
      <NeuralPathways className="absolute inset-0" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-white">
        <h1>Websites that stop the scroll.</h1>
      </div>
    </section>
  );
}`,
    examples: [
      {
        title: "Aurora recolor",
        description: "Emerald top wing, violet bottom wing, stronger blend near the lens.",
        code: `<NeuralPathways
  primary="#34d399"
  secondary="#a78bfa"
  crossTint={0.4}
  cloudTint="#cdb9f5"
/>`,
      },
      {
        title: "Calm continuous lines",
        description:
          "Set pulseLines={false} for solid continuous strands — the traveling whip-wave and fog carry the motion instead.",
        code: `<NeuralPathways pulseLines={false} zoom={0.4} cloudPosition="bottom" />`,
      },
    ],
    notes: [
      "Under prefers-reduced-motion it renders one settled static frame instead of animating.",
      "Strand geometry is computed once per size (ResizeObserver), all line motion is CSS/SMIL, and the fog is a half-resolution WebGL pass — no per-frame JS on the main thread.",
      "Fog needs WebGL; without it the component falls back to SVG turbulence clouds with the same API.",
      "Pauses on hidden tabs.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* SilkAurora                                                                 */
/* -------------------------------------------------------------------------- */

const SILK_AURORA: RegistryEntry = {
  name: "silk-aurora",
  importName: "SilkAurora",
  importPath: "@webcules/ui/components/ui/silk-aurora",
  props: [
    { prop: "colors", label: "Ribbon colors", type: "string[] | string", control: { kind: "colors" }, default: "#ff8a3d,#e2314d,#9333ea,#818cf8", group: "Palette", description: "Gradient stops along each ribbon, tip to tip — 2–4 picks (in code also accepts an array)." },
    { prop: "count", label: "Ribbons", type: "number", control: slider(1, 6, 1), default: 2, group: "Composition", description: "Number of ribbon sheets crossing the field." },
    { prop: "background", label: "Backdrop", type: "string", control: { kind: "color" }, default: "#ffffff", group: "Composition", description: "Backdrop the silk blends against. Use \"transparent\" to let the page show through." },
    { prop: "orientation", label: "Tilt", type: "number", control: slider(-90, 90, 1), default: -35, group: "Composition", description: "Base tilt of the ribbon field, in degrees." },
    { prop: "scale", label: "Zoom", type: "number", control: slider(0.5, 2, 0.05), default: 1, group: "Composition", description: "Global zoom of the composition." },
    { prop: "curvature", label: "Curvature", type: "number", control: slider(0, 1, 0.05), default: 0.55, group: "Shape", description: "How much the ribbons bow around the center (0–1)." },
    { prop: "amplitude", label: "Breathing", type: "number", control: slider(0, 1, 0.05), default: 0.5, group: "Shape", description: "Band-width breathing and flutter strength (0–1)." },
    { prop: "width", label: "Thickness", type: "number", control: slider(0.1, 1, 0.05), default: 0.5, group: "Shape", description: "Band thickness relative to the viewport (0–1)." },
    { prop: "length", label: "Length", type: "number", control: slider(0.4, 1.5, 0.05), default: 1.25, group: "Shape", description: "Ribbon length relative to the viewport diagonal." },
    { prop: "speed", label: "Speed", type: "number", control: slider(0, 3, 0.05), default: 1, group: "Motion", description: "Time multiplier; 0 = frozen. 1 ≈ the reference's ~14 s cycle." },
    { prop: "drift", label: "Drift", type: "number", control: slider(0, 1, 0.05), default: 0.7, group: "Motion", description: "How far the crossing point wanders vs pure rotation (0–1)." },
    { prop: "interactive", label: "Pointer lean", type: "boolean", control: BOOL, default: false, group: "Motion", description: "The field leans subtly toward the pointer." },
    { prop: "intensity", label: "Intensity", type: "number", control: slider(0, 1, 0.05), default: 0.85, group: "Rendering", description: "Ribbon opacity / color strength (0–1)." },
    { prop: "softness", label: "Softness", type: "number", control: slider(0, 1, 0.05), default: 0.55, group: "Rendering", description: "Edge feathering (0–1): low = glassy, high = misty." },
    { prop: "blend", label: "Blend", type: '"normal" | "multiply" | "screen" | "overlay"', control: select(["normal", "multiply", "screen", "overlay"]), default: "normal", group: "Rendering", description: "Ribbon compositing — multiply = ink on light, screen = glow on dark." },
    { prop: "sheen", label: "Gloss", type: "number", control: slider(0, 1, 0.05), default: 0.5, group: "Rendering", description: "Glass finish: broad reflection, specular streak and dark rim (0–1)." },
    { prop: "grain", label: "Grain", type: "number", control: slider(0, 1, 0.05), default: 0, group: "Rendering", description: "Film-grain overlay (0–1); needs a background color to sit on." },
    { prop: "seed", label: "Seed", type: "number", control: slider(1, 99, 1), default: 1, group: "Rendering", description: "Deterministic variation — same seed, same silk." },
  ],
  docs: {
    highlights: [
      "Flowing silk ribbons of gradient light — a living aurora that breathes, swings and leans behind your hero copy",
      "One prop surface covers light silk, chrome glass and midnight-nebula moods: colors, blend, sheen, softness",
      "Pure canvas 2D on a low-res upscaled buffer: the blur is free, single-digit ms per frame even at 6 ribbons",
      "Zero dependencies, deterministic seed, aria-hidden, and one settled frame under prefers-reduced-motion",
    ],
    usage: `import { SilkAurora } from "@webcules/ui/components/ui/silk-aurora";

export function Hero() {
  return (
    <section className="relative h-screen overflow-hidden">
      <SilkAurora className="absolute inset-0" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <h1>retro soul, modern vision.</h1>
      </div>
    </section>
  );
}`,
    examples: [
      {
        title: "Recolor — your brand ramp",
        description:
          "colors maps along each ribbon, tip to tip. Odd ribbons run the ramp reversed, keeping the composition balanced.",
        code: `<SilkAurora
  colors={["#34d399", "#0ea5e9", "#6366f1"]}
  background="#fafaf9"
/>`,
      },
      {
        title: "Chrome glass",
        description:
          "Multiply on paper, low softness, high sheen: the silk becomes stylized glass with a bright fold and a dark counter-edge.",
        code: `<SilkAurora
  colors={["#0e2a38", "#2b6777", "#9fc4d0", "#e8f1f4"]}
  background="#f4f5f7"
  blend="multiply"
  softness={0.45}
  sheen={0.85}
  count={3}
/>`,
      },
      {
        title: "Midnight nebula",
        description:
          "Screen blending on near-black turns the same ribbons into a glowing dark-mode aurora; a touch of grain finishes it.",
        code: `<SilkAurora
  colors={["#7c3aed", "#4f46e5", "#c4b5fd", "#f59e0b"]}
  background="#050508"
  blend="screen"
  intensity={0.9}
  count={3}
  grain={0.15}
/>`,
      },
    ],
    notes: [
      "origin is an object — set it in code; every other prop, including the ribbon colors, is tunable in the toolbox.",
      "colors takes a comma-separated string (as the toolbox emits) or a real array — same result.",
      "Blend modes blend against the backdrop painted into the canvas — with background=\"transparent\" they fall back to plain alpha layering.",
      "Renders through a low-resolution offscreen buffer upscaled with smoothing; per-frame cost stays flat as the component scales.",
      "Under prefers-reduced-motion it renders one settled static frame; the loop pauses on hidden tabs.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* LiquidBulb                                                                 */
/* -------------------------------------------------------------------------- */

const LIQUID_BULB: RegistryEntry = {
  name: "liquid-bulb",
  importName: "LiquidBulb",
  importPath: "@webcules/ui/components/ui/liquid-bulb",
  props: [
    { prop: "colors", label: "Iridescence", type: "string[] | string", control: { kind: "colors" }, default: "#ba1766,#0089b3,#163cd4,#774ac9,#df307b", group: "Palette", description: "Spectral ramp walked along each ribbon loop — 2–4 picks (in code also accepts an array)." },
    { prop: "background", label: "Backdrop", type: "string", control: { kind: "color" }, default: "#ffffff", group: "Composition", description: "Backdrop the sphere sits on. Use \"transparent\" to let the page show through." },
    { prop: "size", label: "Size", type: "number", control: slider(0.2, 0.95, 0.01), default: 0.85, group: "Composition", description: "Sphere diameter as a fraction of the shorter side." },
    { prop: "scale", label: "Zoom", type: "number", control: slider(0.5, 1.5, 0.05), default: 0.85, group: "Composition", description: "Global zoom of the composition." },
    { prop: "bands", label: "Ribbons", type: "number", control: slider(1, 6, 1), default: 3, group: "Swirl", description: "Glass ribbon loops wrapped around the sphere." },
    { prop: "tilt", label: "Axis tilt", type: "number", control: slider(-90, 90, 1), default: -63, group: "Swirl", description: "Tilt of the shared orbital axis, in degrees." },
    { prop: "swirl", label: "Swirl", type: "number", control: slider(0, 1, 0.05), default: 1, group: "Swirl", description: "Per-loop radius/inclination variation and counter-drift (0–1)." },
    { prop: "speed", label: "Speed", type: "number", control: slider(0, 3, 0.05), default: 0.6, group: "Motion", description: "Orbit drift rate; 0 = frozen." },
    { prop: "interactive", label: "Pointer tilt", type: "boolean", control: BOOL, default: false, group: "Motion", description: "The sphere tilts subtly toward the pointer." },
    { prop: "frost", label: "Frost", type: "number", control: slider(0, 1, 0.05), default: 1, group: "Glass", description: "Milky body opacity of the glass (0–1)." },
    { prop: "iridescence", label: "Iridescence", type: "number", control: slider(0, 1, 0.05), default: 0.85, group: "Glass", description: "Spectral fringe strength on the ribbon folds and silhouette (0–1)." },
    { prop: "gloss", label: "Gloss", type: "number", control: slider(0, 1, 0.05), default: 0.8, group: "Glass", description: "Specular streaks, sheen and rim light (0–1)." },
    { prop: "softness", label: "Softness", type: "number", control: slider(0, 1, 0.05), default: 0.65, group: "Glass", description: "Upscale blur (0–1); push high for the defocused aura look." },
    { prop: "shadow", label: "Shadow", type: "number", control: slider(0, 1, 0.05), default: 0.4, group: "Glass", description: "Contact shadow grounding the sphere (0–1)." },
    { prop: "grain", label: "Grain", type: "number", control: slider(0, 1, 0.05), default: 0, group: "Rendering", description: "Film-grain overlay (0–1); needs a background color to sit on." },
    { prop: "seed", label: "Seed", type: "number", control: slider(1, 99, 1), default: 1, group: "Rendering", description: "Deterministic variation — same seed, same bulb." },
  ],
  docs: {
    highlights: [
      "A liquid-glass sphere wrapped in ribbon loops that drift around a shared tilted axis — the swirl reads as liquid revolving inside a glass shell",
      "Milky frosted body, spectral fringes on the folds, hard specular streaks and dark creases — thin-film glass, painted entirely in canvas 2D",
      "Two shipped looks out of one prop surface: the crisp prism bulb and the defocused pastel aura (softness + frost)",
      "Depth-sorted ribbons, deterministic seed, zero dependencies, aria-hidden, one settled frame under prefers-reduced-motion",
    ],
    usage: `import { LiquidBulb } from "@webcules/ui/components/ui/liquid-bulb";

export function Hero() {
  return (
    <section className="relative h-screen overflow-hidden">
      <LiquidBulb className="absolute inset-0" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <h1>Signals from the deep</h1>
      </div>
    </section>
  );
}`,
    examples: [
      {
        title: "Prism — the reference bulb",
        description:
          "The default look: pastel spectral ribbons on a light backdrop, hard gloss, grounded by a soft contact shadow.",
        code: `<LiquidBulb
  colors={["#ffd3e8", "#c9f2ff", "#d6ffcf", "#e4d5ff", "#fff1c9"]}
  background="#dedee0"
  bands={3}
  tilt={-34}
  frost={0.55}
  iridescence={0.8}
  gloss={0.7}
/>`,
      },
      {
        title: "Aura — defocused pastel orb",
        description:
          "Frost up, gloss and shadow down, softness near max: the same sphere becomes a dreamy blurred glow behind hero copy.",
        code: `<LiquidBulb
  background="#f4f4f6"
  bands={2}
  tilt={-20}
  frost={0.85}
  iridescence={0.55}
  gloss={0.3}
  softness={0.85}
  shadow={0.12}
/>`,
      },
      {
        title: "Midnight bulb",
        description:
          "A dark-room variant: cool spectral ribbons on near-black, higher iridescence so the fringes carry the color.",
        code: `<LiquidBulb
  colors={["#7dd3fc", "#f0abfc", "#86efac", "#c4b5fd"]}
  background="#0a0a12"
  iridescence={1}
  gloss={0.55}
  frost={0.35}
  shadow={0.2}
  grain={0.1}
/>`,
      },
    ],
    notes: [
      "origin is an object — set it in code; every other prop, including the iridescent palette, is tunable in the toolbox.",
      "colors takes a comma-separated string (as the toolbox emits) or a real array — same result.",
      "Ribbon halves on the far side of the orbit are painted first and dimmed under the frosted shell, so back ribbons read as seen through glass.",
      "Renders through a low-resolution offscreen buffer upscaled with smoothing; softness controls that blur — at 0 the rim stays crisp, at 1 the orb melts into an aura.",
      "Under prefers-reduced-motion it renders one settled static frame; the loop pauses on hidden tabs.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* CardTrain                                                                  */
/* -------------------------------------------------------------------------- */

const CARD_TRAIN: RegistryEntry = {
  name: "card-train",
  importName: "CardTrain",
  importPath: "@webcules/ui/components/ui/card-train",
  props: [
    { prop: "colors", label: "Card palette", type: "string[] | string", control: { kind: "colors" }, default: "#f4a7b3,#a9b6e6,#d9aee0", group: "Palette", description: "Per-card color cycle — the train walks it by index (in code also accepts an array)." },
    { prop: "background", label: "Backdrop", type: "string", control: { kind: "color" }, default: "#e8e6e2", group: "Composition", description: "Backdrop the train rides on. Use \"transparent\" to let the page show through." },
    { prop: "cardSize", label: "Card size", type: "number", control: slider(60, 260, 2), default: 150, group: "Composition", description: "Base card edge in px — auto-scales down on narrow containers." },
    { prop: "count", label: "Cards", type: "number", control: slider(8, 60, 1), default: 26, group: "Composition", description: "Minimum cards in the stream — auto-raised to fill the width." },
    { prop: "overlap", label: "Overlap", type: "number", control: slider(0, 0.9, 0.01), default: 0.65, group: "Composition", description: "Fraction of each card hidden by the next — high values read as one ribbon." },
    { prop: "amplitude", label: "Wave height", type: "number", control: slider(0.02, 0.4, 0.01), default: 0.18, group: "Wave", description: "Wave height as a fraction of the container height." },
    { prop: "wavelength", label: "Wave length", type: "number", control: slider(0.5, 3, 0.05), default: 1.4, group: "Wave", description: "Wave length as a fraction of the container width." },
    { prop: "speed", label: "Speed", type: "number", control: slider(0, 0.6, 0.01), default: 0.12, group: "Motion", description: "Stream speed in container-widths per second; 0 = frozen." },
    { prop: "tilt", label: "Flip", type: "number", control: slider(0, 1.5, 0.05), default: 1, group: "Motion", description: "Flip intensity — 0 rides a flat rail, 1 is the cinematic default." },
    { prop: "depth", label: "Depth", type: "number", control: slider(0, 1, 0.05), default: 0.25, group: "Motion", description: "Perspective amount — crest scale plus trough dimming." },
    { prop: "confetti", label: "Confetti", type: "boolean", control: BOOL, default: true, group: "Ambience", description: "Drifting square-shard ambience layer around the train." },
    { prop: "confettiCount", label: "Confetti count", type: "number", control: slider(0, 60, 1), default: 24, group: "Ambience", description: "How many confetti squares drift." },
    { prop: "seed", label: "Seed", type: "number", control: slider(1, 99, 1), default: 1, group: "Rendering", description: "Deterministic confetti field — same seed, same sky." },
  ],
  docs: {
    highlights: [
      "An endless train of overlapping cards flows along a traveling wave, each card flipping through 3D as it rides the rail — the \"shipping\" hero, prop-driven",
      "Hand-rolled perspective projection in canvas 2D: crests sit closer and larger, troughs recede and dim toward the backdrop — no WebGL, no dependencies",
      "Shadows fall card-to-card, so the stack reads as layered paper, not flat sprites; colors cycle per card from any palette you pass",
      "Seamless loop (cards spawn off-canvas), deterministic seed, aria-hidden, one settled frame under prefers-reduced-motion",
    ],
    usage: `import { CardTrain } from "@webcules/ui/components/ui/card-train";

export function Hero() {
  return (
    <section className="relative h-[600px] overflow-hidden">
      <CardTrain className="absolute inset-0" />
      <h1 className="absolute bottom-16 left-16 text-6xl">
        Always be shipping
      </h1>
    </section>
  );
}`,
    examples: [
      {
        title: "Candy — the reference look",
        description:
          "Rose / periwinkle / lilac cards on warm paper-gray. Compose the copy like the train wants it: headline bottom-left, tagline top-right.",
        code: `<CardTrain
  colors={["#f4a7b3", "#a9b6e6", "#d9aee0"]}
  background="#e8e6e2"
/>`,
      },
      {
        title: "Sunset — warmer, friendlier",
        description:
          "Coral / amber / rose cards on warm cream — same geometry, different mood.",
        code: `<CardTrain
  colors={["#f2977f", "#f2c14e", "#e88aa0"]}
  background="#faf3ea"
/>`,
      },
      {
        title: "Midnight — dark heroes",
        description:
          "Indigo / steel-blue / violet cards with brighter gradients on deep navy. Bump depth so the crest scale carries the dark scene.",
        code: `<CardTrain
  colors={["#5b6bd6", "#7f9bd9", "#9a7fd6"]}
  background="#12141f"
  depth={0.35}
/>`,
      },
    ],
    notes: [
      "colors takes a comma-separated string (as the toolbox emits) or a real array — same result.",
      "The wave itself glides slowly forward; the train rides it, so cards bob gently as they travel — speed={0} freezes both.",
      "cardSize auto-scales down on narrow containers (capped at ~10% of the width) so the train stays proportional on phones.",
      "Confetti mostly sits behind the train; a few squares drift in front to keep the scene airy.",
      "Under prefers-reduced-motion it renders one settled static frame; the loop pauses on hidden tabs.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* FollowingEyes                                                              */
/* -------------------------------------------------------------------------- */

const FOLLOWING_EYES: RegistryEntry = {
  name: "following-eyes",
  importName: "FollowingEyes",
  importPath: "@webcules/ui/components/ui/following-eyes",
  props: [
    { prop: "src", label: "Image URL", type: "string", control: { kind: "text" }, default: "/mascots/following-eyes-buddy.png", group: "Image", description: "Any picture the eyes sit on — paste your own URL. Eye positions are % of the image box." },
    { prop: "eyeSize", label: "Eye size", type: "number (% of image width)", control: slider(4, 16, 0.5), default: 7, group: "Eyes", description: "Eye diameter as a percentage of the image width." },
    { prop: "pupilRatio", label: "Pupil size", type: "number (0–1)", control: slider(0.3, 0.8, 0.02), default: 0.55, group: "Eyes", description: "Pupil diameter as a fraction of the eye diameter." },
    { prop: "pupilColor", label: "Pupil color", type: "string", control: { kind: "color" }, default: "#141416", group: "Eyes", description: "Pupil fill color." },
    { prop: "shine", label: "Shine glint", type: "boolean", control: BOOL, default: true, group: "Eyes", description: "The specular highlight on the pupil." },
    { prop: "radius", label: "Travel clamp", type: "number (× eye radius)", control: slider(0.15, 0.7, 0.01), default: 0.4, group: "Motion", description: "How far the pupil may travel from center (maps to follow.radius)." },
    { prop: "stiffness", label: "Stiffness", type: "number (0–1)", control: slider(0.04, 0.5, 0.01), default: 0.14, group: "Motion", description: "Per-frame ease toward the pointer — lower is laggier (maps to follow.stiffness)." },
    { prop: "blink", label: "Blink", type: "boolean", control: BOOL, default: true, group: "Life", description: "Seeded auto-blink every 2.5–6 s." },
    { prop: "idle", label: "Idle wander", type: "boolean", control: BOOL, default: true, group: "Life", description: "The eyes look around seeded points when the pointer is quiet." },
    { prop: "tear", label: "Tear", type: '"click" | "idle" | false', control: select(["click", "idle", "off"]), default: "click", group: "Life", description: "A teardrop wells up under an eye then falls — on click, or periodically while idle." },
    { prop: "seed", label: "Seed", type: "number", control: slider(1, 99, 1), default: 1, group: "Life", description: "Deterministic blink/wander variation — same seed, same life." },
  ],
  docs: {
    highlights: [
      "Upload any image and place customizable eyes on it — the pupils follow the cursor everywhere on the page, not just over the picture",
      "Size, pupil size, shine glint, tear drop, blink and idle wander are all live props; per-eye overrides for asymmetric faces",
      "Pure DOM/SVG with transform-only updates — zero dependencies, vector-crisp at any DPR, effectively zero per-frame cost",
      "aria-hidden eye layer, seeded deterministic life, and reduced-motion snaps pupils to the pointer with no autonomous motion",
    ],
    usage: `import { FollowingEyes } from "@webcules/ui/components/ui/following-eyes";

export function Mascot() {
  return (
    <FollowingEyes
      src="/mascot.png"
      alt="Our studio mascot"
      eyes={[{ x: 37, y: 41 }, { x: 63, y: 41 }]}
      eyeSize={12}
      tear="click"
    />
  );
}`,
    examples: [
      {
        title: "Paste any picture",
        description:
          "eyes takes the eye centers as % of the image box — read them off any editor. Images with closed or blank eyes work best: the overlays replace them and the character wakes up.",
        code: `<FollowingEyes
  src="/team/ada.png"
  alt="Ada, our founder"
  eyes={[{ x: 44, y: 38 }, { x: 56, y: 38 }]}
  eyeSize={7}
/>`,
      },
      {
        title: "Per-eye overrides",
        description:
          "Every eye can override size, pupil ratio and add a constant tilt — for side glances, perspective faces, animals.",
        code: `<FollowingEyes
  src="/owls.jpg"
  alt="Two owls"
  eyes={[
    { x: 30, y: 28, size: 5, tilt: -8 },
    { x: 70, y: 24, size: 6, tilt: 6 },
  ]}
/>`,
      },
      {
        title: "Pairs with CustomCursor",
        description:
          "The mascot-hero look: a big outlined cursor trailing the pointer while the eyes track it. Both ship from this library.",
        code: `import { CustomCursor } from "@webcules/ui/components/ui/custom-cursor";

<CustomCursor />
<FollowingEyes src="/mascot.png" alt="Mascot" eyeSize={12} tear="click" />`,
      },
    ],
    notes: [
      "The eye layer is decorative (aria-hidden) — all content lives in the alt-ed image and your surrounding copy; no text is baked in.",
      "Eyes coordinates: x/y are the eye centers as % of the image box, read from the top-left. Tune them per image in code.",
      "radius and stiffness in the toolbox map to the follow={{ radius, stiffness }} object prop in code.",
      "Pointer tracking is page-wide; on touch devices the eyes wander. Under prefers-reduced-motion pupils snap to the pointer — direct manipulation, no autonomous motion.",
      "Blink and wander derive from seed via a sin-hash — recordings, stills and CI screenshots are reproducible.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* CineScroll                                                                 */
/* -------------------------------------------------------------------------- */

const CINE_SCROLL: RegistryEntry = {
  name: "cine-scroll",
  importName: "CineScroll",
  importPath: "@webcules/ui/components/ui/cine-scroll",
  props: [
    { prop: "video", label: "Video URL", type: "string", control: { kind: "text" }, default: "", group: "Film", description: "Optional clip URL — the scrub seeks the video with scroll instead of the frames. Leave empty for the SHŪDEN frame set." },
    { prop: "blend", label: "Blend", type: '"exposure" | "crossfade"', control: select(["exposure", "crossfade"]), default: "exposure", group: "Film", description: "exposure = lighten double-exposure between plates (the reference look); crossfade = plain alpha. No effect in video mode." },
    { prop: "motionBlur", label: "Whip blur", type: "number (0–1)", control: slider(0, 1, 0.05), default: 0.6, group: "Film", description: "Velocity-scaled directional blur while you scroll fast — the 'one unbroken camera move' feel." },
    { prop: "drift", label: "Drift", type: "number (0–0.15)", control: slider(0, 0.15, 0.005), default: 0, group: "Film", description: "Ken Burns push-in/pan per plate so stills breathe. Off by default — video frames are already alive." },
    { prop: "scrollSmoothing", label: "Scrub damping", type: "number (0–0.4)", control: slider(0, 0.4, 0.01), default: 0.14, group: "Scrub", description: "Lerped scrub lag. 0 = raw scrollbar, ~0.14 = filmic." },
    { prop: "vignette", label: "Vignette", type: "number (0–0.8)", control: slider(0, 0.8, 0.05), default: 0.35, group: "Grade", description: "Edge darkening — unifies mixed-source plates into one grade." },
    { prop: "grain", label: "Grain", type: "number (0–0.4)", control: slider(0, 0.4, 0.02), default: 0.12, group: "Grade", description: "Animated film grain (deterministic per frame)." },
  ],
  docs: {
    highlights: [
      "Scroll is the camera: a tall section pins its stage while the scrollbar scrubs an ordered frame sequence — photos, renders or AI plates, your media",
      "Adjacent plates double-expose into each other; fast scrolling adds a directional whip blur, slow scrolling breathes with a Ken Burns push-in",
      "Chapters are real DOM (selectable, indexable) that fade and rise inside progress windows — pair with the exported CineIndexRows and CineStat primitives",
      "Works as a page hero (window scroll) or embedded: set stageHeight to the container viewport and it scrubs inside any scroll box",
      "Canvas 2D, zero deps; one RAF parked off-screen/hidden-tab; reduced-motion keeps scroll→frame direct manipulation with no autonomous motion",
    ],
    usage: `import { CineScroll, CineIndexRows } from "@webcules/ui/components/ui/cine-scroll";

const frames = [
  "/plates/shot-01.webp",
  "/plates/shot-02.webp",
  "/plates/shot-03.webp",
  "/plates/shot-04.webp",
];

export function FilmHero() {
  return (
    <CineScroll
      frames={frames}
      height="500vh"
      blend="exposure"
      motionBlur={0.6}
      chapters={[
        {
          from: 0,
          to: 0.2,
          align: "center",
          content: (
            <div className="text-center text-white">
              <p className="text-[11px] uppercase tracking-[0.4em]">A film you scroll through</p>
              <h1 className="mt-3 text-6xl font-semibold">STUDIO®</h1>
            </div>
          ),
        },
        {
          from: 0.3,
          to: 0.55,
          align: "left",
          content: <p className="text-xl text-white">Impossible scenes, told like they happened.</p>,
        },
        {
          from: 0.65,
          to: 0.9,
          align: "right",
          content: (
            <CineIndexRows
              rows={[
                { year: "2025", title: "Hayate", note: "No detours" },
                { year: "2024", title: "Tsuki", note: "One last train" },
              ]}
            />
          ),
        },
      ]}
    />
  );
}`,
    examples: [
      {
        title: "Make the plates with local ComfyUI",
        description:
          "Generate a consistent camera move: plate 1 from text, every next plate as img2img off the previous one (denoise ≈0.5) with a per-beat camera prompt. Same style + cast block verbatim in every prompt is what makes the scrub read as one scene.",
        code: `// research/generate-plates.ts in the social-forge project —
// beats: wide → tumble close-up → car pass → whip close → slide → leap
const style = "1990s Japanese anime film still, cel animation, dusk city, …";
const beats = ["sprinting toward camera, wide", "close-up, dutch angle", "…"];
// plate 1: txt2img · plate n: img2img(plate n−1, denoise 0.5)`,
      },
      {
        title: "Stat counters over the final shot",
        description: "Export CineStat gives the small-caps label over the huge serif-italic numeral from the reference.",
        code: `import { CineScroll, CineStat } from "@webcules/ui/components/ui/cine-scroll";

<CineScroll
  frames={frames}
  chapters={[
    {
      from: 0.84,
      to: 1,
      align: "center",
      at: "bottom",
      content: (
        <div className="flex gap-14">
          <CineStat label="Clients" value="73" />
          <CineStat label="Sets built" value="208" />
        </div>
      ),
    },
  ]}
/>`,
      },
    ],
    notes: [
      "Bring your own media: pass frames (any image URLs, ≈8–16 plates, webp, 16:9) or a single video URL as video — the scrub then seeks the clip with scroll. The SHŪDEN demo frames are cut from one locally generated Wan 2.2 image→video camera move; the reference site runs a real-time 3D scene, the scrub pattern is identical.",
      "Chapters are progress windows (0–1). A chapter starting at from: 0 is visible before any scroll; others fade/rise inside their window.",
      "Chapters are progress windows (0–1). A chapter starting at from: 0 is visible before any scroll; others fade/rise inside their window.",
      "The canvas is aria-hidden; chapter copy is real DOM and stays readable by screen readers at every scroll position.",
      "Prefer reduced motion: scrubbing becomes direct manipulation — scroll still swaps plates instantly, with no smoothing, blur, drift or grain animation.",
      "Plates are decoded once into offscreen canvases (capped 1600px wide) and DPR is capped at 2; the RAF loop parks when the section is off-screen or the tab is hidden.",
    ],
  },
};

/* -------------------------------------------------------------------------- */

export const REGISTRY: Record<string, RegistryEntry> = {
  "wildcode-field": WILDCODE_FIELD,
  "neural-pathways": NEURAL_PATHWAYS,
  "silk-aurora": SILK_AURORA,
  "liquid-bulb": LIQUID_BULB,
  "card-train": CARD_TRAIN,
  "following-eyes": FOLLOWING_EYES,
  "cine-scroll": CINE_SCROLL,
};

export function getRegistryEntry(name: string): RegistryEntry | undefined {
  return REGISTRY[name];
}

export function defaultsOf(entry: RegistryEntry): ConfigValues {
  return Object.fromEntries(entry.props.map((p) => [p.prop, p.default]));
}

/** Toolbox groups in first-seen order. */
export function groupsOf(entry: RegistryEntry): { group: string; props: PropSpec[] }[] {
  const groups: { group: string; props: PropSpec[] }[] = [];
  for (const p of entry.props) {
    let g = groups.find((x) => x.group === p.group);
    if (!g) {
      g = { group: p.group, props: [] };
      groups.push(g);
    }
    g.props.push(p);
  }
  return groups;
}

/** JSX for one prop value — `colors` slots emit a real array literal. */
function formatPropValue(v: ConfigValues[string], spec?: PropSpec): string {
  if (typeof v === "number") return `{${v}}`;
  if (typeof v === "boolean") return `{${v}}`;
  if (spec?.control.kind === "colors") {
    const stops = String(v)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return `{[${stops.map((s) => `"${s}"`).join(", ")}]}`;
  }
  return `"${v}"`;
}

/** JSX for the changed props only — the tweaks, ready to paste. */
export function changedPropsJsx(entry: RegistryEntry, values: ConfigValues): [string, string][] {
  const out: [string, string][] = [];
  for (const p of entry.props) {
    const v = values[p.prop];
    if (v !== undefined && v !== p.default) out.push([p.prop, formatPropValue(v, p)]);
  }
  return out;
}

/** Full ready-to-paste snippet: import + tag with the current tweaks. */
export function copyCodeFor(entry: RegistryEntry, values: ConfigValues): string {
  const changed = changedPropsJsx(entry, values);
  const attrs =
    changed.length > 0
      ? changed.map(([k, v]) => `  ${k}=${v}`).join("\n")
      : `  className="…"`;
  return `import { ${entry.importName} } from "${entry.importPath}";

<${entry.importName}
${attrs}
/>`;
}

export function copyConfigFor(entry: RegistryEntry, values: ConfigValues): string {
  const changed: ConfigValues = {};
  for (const p of entry.props) {
    const v = values[p.prop];
    if (v !== undefined && v !== p.default) changed[p.prop] = v;
  }
  return JSON.stringify({ component: entry.name, config: changed }, null, 2);
}
