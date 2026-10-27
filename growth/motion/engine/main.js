// Loads an episode spec and exposes window.__reel for render.mjs.
// Three layers, as in the anatomy skill: a back SVG, a WebGL canvas, a front SVG.
// Scenes are pure functions of their local time; nothing here keeps state between frames.

const params = new URLSearchParams(location.search);
const specUrl = params.get("spec");

const spec = await (await fetch(specUrl)).json();
const types = [...new Set(spec.scenes.map((s) => s.type))];
const modules = Object.fromEntries(await Promise.all(types.map(async (t) => [t, (await import(`./scenes/${t}.js`)).default])));

const back = document.getElementById("back");
const front = document.getElementById("front");
const canvas = document.getElementById("gl");

const ctx = {
  spec,
  canvas,
  // Paths are relative to the engine folder, served from the repo root by render.mjs.
  asset: (p) => new URL(`../../../${p}`, import.meta.url).href,
  three: null,
};

// Scenes that draw in WebGL load three.js once, from the pinned vendored build.
if (types.some((t) => modules[t].usesGL)) {
  ctx.three = await import("../vendor/three.module.min.js");
}

for (const t of types) if (modules[t].init) await modules[t].init(ctx, spec.scenes.filter((s) => s.type === t));
await document.fonts.ready;

const cues = spec.scenes.flatMap((s) => (modules[s.type].cues ? modules[s.type].cues(s.props ?? {}, s.dur).map((c) => ({ ...c, t: c.t + s.at })) : []));

function seek(t) {
  let b = "";
  let f = "";
  let glUsed = false;
  for (const s of spec.scenes) {
    if (t < s.at || t > s.at + s.dur) continue;
    const m = modules[s.type];
    const out = m.render(t - s.at, s.dur, s.props ?? {}, ctx, t);
    b += out.back ?? "";
    f += out.front ?? "";
    if (out.gl) glUsed = true;
  }
  back.innerHTML = b;
  front.innerHTML = f;
  canvas.style.visibility = glUsed ? "visible" : "hidden";
}

window.__reel = {
  id: spec.id,
  duration: spec.duration,
  fps: spec.fps ?? 30,
  cues,
  seek: async (t) => {
    seek(t);
    await new Promise((r) => requestAnimationFrame(() => r()));
  },
};
window.__ready = true;
