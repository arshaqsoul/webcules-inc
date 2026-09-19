/* pnpm forge:new <name> [--phrase "Text"] [--title "Title"] [--premium]
 * Scaffolds a draft component: spec.json (breakdown template) + a running
 * canvas-skeleton component in packages/ui + a draft library entry. */
import {
  log, die, readLibrary, writeLibrary, writeJson, existsSync,
  mkdirSync, writeFileSync, join, UI_PKG, LIBRARY_DIR, specPath, validateSpec,
  getEntry,
} from "./lib/common.mjs";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
if (!name || !/^[a-z][a-z0-9-]*$/.test(name))
  die("usage: pnpm forge:new <name> [--phrase \"Text\"] [--title \"Title\"] [--premium]",
      "name must be lowercase kebab-case, e.g. aurora-hero");

const flag = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] ?? "" : null;
};
const phrase = flag("--phrase") || "Start today";
const title = flag("--title") || name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const premium = args.includes("--premium");
const compName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); // PascalCase-ish

const lib = readLibrary();
if (getEntry(lib, name) || existsSync(specPath(name)))
  die(`component "${name}" already exists`, "pick another name or edit the existing spec");

/* ---- 1. spec.json — the breakdown contract ---- */
const spec = {
  name,
  title,
  tagline: "TODO: one-liner shown on the library card",
  description: "TODO: 2–3 sentences describing the experience.",
  tags: ["canvas", "animation"],
  premium,
  docsMode: "generated",
  phrase,
  interactive: true,
  reference: {
    type: "image | video | none",
    path: ".forge/<name>/reference.*",
    notes: "What the reference shows, in your own words.",
  },
  breakdown: {
    layers: [
      // back → front. kind: stencil | texture | sprite | glow | overlay
      { id: "base", kind: "stencil", desc: "TODO: base shapes / lettering" },
      { id: "glow", kind: "glow", desc: "TODO: soft light sources" },
      { id: "main", kind: "sprite", desc: "TODO: primary moving objects" },
    ],
    animation: [
      // trigger: beam | time | pointer | scroll | click
      { target: "main", trigger: "beam", easing: "easeOutCubic", desc: "TODO: what animates and when" },
    ],
    scroll: [{ effect: "none", desc: "TODO: scroll behaviour (parallax / pin / none)" }],
    images: { strategy: "procedural", desc: "TODO: procedural art vs provided assets" },
    video: { strategy: "none", desc: "TODO: embedded video role, if any" },
    scrub: { enabled: false, desc: "TODO: timeline scrubbing behaviour" },
    ux: [
      "role=img + aria-label on the region",
      "prefers-reduced-motion → static frame",
      "pause animation when offscreen",
    ],
  },
  interactions: [
    { type: "pointer", effect: "second paint beam + glow" },
    { type: "click", effect: "shockwave / squash" },
  ],
  cycle: { grow: 6, hold: 5, retract: 1.8, rest: 0.6 },
};
writeJson(specPath(name), spec);
const errs = validateSpec(spec);
if (errs.length) {
  log.warn("spec has TODO placeholders (expected — fill them in before approve):");
  errs.forEach((e) => log.warn("  - " + e));
}

/* ---- 2. component scaffold in packages/ui (client canvas starter) ---- */
const compFile = join(UI_PKG, `${name}.tsx`);
if (!existsSync(compFile)) {
  writeFileSync(
    compFile,
    `"use client";

/* ============================================================================
 * <${compName} /> — forged component (spec: library/${name}/spec.json)
 *
 * Standard pipeline: stencil/layers → beam scheduler → bloom transforms →
 * pointer interactions → phase cycle (GROW/HOLD/RETRACT/REST).
 * Refine the draw() implementations below; the plumbing already runs.
 * ==========================================================================*/
import { useEffect, useRef } from "react";

import { cn } from "@webcules/ui/lib/utils";

export type ${compName}Props = {
  phrase?: string;
  className?: string;
};

export function ${compName}({ phrase = ${JSON.stringify(phrase)}, className, style }: ${compName}Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = host.clientWidth, H = host.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + "px";

    // L0..Ln layers — one draw function per spec.breakdown.layers entry
    const layers: ((ctx: CanvasRenderingContext2D, t: number) => void)[] = [
      (c, t) => { /* TODO: L0 base — c.fillStyle="#5839a8"; c.fillRect(0,0,W,H) */ },
      (c, t) => { /* TODO: L1 glow / L2 sprites — beam-driven drawing */ },
    ];

    let raf = 0; const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const draw of layers) draw(ctx, t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={hostRef} className={cn("relative", className)} role="img" aria-label={phrase} style={{ cursor: "none", ...style }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />
    </div>
  );
}
function useImperativeAbortiveNote() { /* placeholder — replace with your handle wiring */ }
`,
    "utf-8",
  );
  log.ok("component scaffold: packages/ui/src/components/" + name + ".tsx");
}

/* ---- 3. draft library entry ---- */
const entry = {
  name,
  title,
  tagline: spec.tagline,
  description: spec.description,
  tags: spec.tags,
  premium,
  phase: "draft",
  docsMode: "generated",
  phrase,
};
lib.components = lib.components.filter((c) => c.name !== name);
lib.components.push(entry);
writeLibrary(lib);

mkdirSync(join(LIBRARY_DIR, name, ".forge"), { recursive: true });
log.ok(`draft "${name}" created`);
console.log(`
Next steps:
  1. pnpm forge:analyze ${name} <reference-image-or-video>   # optional: frame extraction + checklist
  2. Fill library/${name}/spec.json (layers, animation, ux, interactions)
  3. Implement the drawing in packages/ui/src/components/${name}.tsx
  4. pnpm forge:record ${name}                                # capture preview.webp
  5. pnpm forge:approve ${name} ${premium ? "--premium" : ""}              # validate + publish to the library
  6. pnpm forge:deploy                                        # ship webcules.com`);
