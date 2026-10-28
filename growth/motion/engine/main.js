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
// The bottom layer: a pre-rendered picture per frame (a generated clip), drawn before capture.
const plate = document.getElementById("plate");
const plateCtx = plate.getContext("2d");
let plateUrl = null;

const ctx = {
  spec,
  canvas,
  // Paths are relative to the engine folder, served from the repo root by render.mjs.
  asset: (p) => new URL(`../../../${p}`, import.meta.url).href,
  three: null,
};

// Scenes that draw in WebGL load three.js once, from the pinned vendored build.
if (types.some((t) => modules[t].usesGL)) {
  ctx.three = await import("three");
  // One renderer for every GL scene: two contexts on one canvas would fight.
  const THREE = ctx.three;
  ctx.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  ctx.renderer.setPixelRatio(1);
  ctx.renderer.setSize(1080, 1920, false);
  ctx.renderer.outputColorSpace = THREE.SRGBColorSpace;
}

for (const t of types) if (modules[t].init) await modules[t].init(ctx, spec.scenes.filter((s) => s.type === t));
await document.fonts.ready;

const cues = spec.scenes.flatMap((s) => (modules[s.type].cues ? modules[s.type].cues(s.props ?? {}, s.dur).map((c) => ({ ...c, t: c.t + s.at })) : []));

function seek(t) {
  let b = "";
  let f = "";
  let glUsed = false;
  let pl = null;
  for (const s of spec.scenes) {
    if (t < s.at || t > s.at + s.dur) continue;
    const m = modules[s.type];
    const out = m.render(t - s.at, s.dur, s.props ?? {}, ctx, t);
    b += out.back ?? "";
    f += out.front ?? "";
    if (out.gl) glUsed = true;
    if (out.plate) pl = out.plate;
  }
  back.innerHTML = b;
  front.innerHTML = f;
  canvas.style.visibility = glUsed ? "visible" : "hidden";
  return pl;
}

async function drawPlate(url) {
  if (url === plateUrl) return;
  plateUrl = url;
  if (!url) return plateCtx.clearRect(0, 0, plate.width, plate.height);
  const img = new Image();
  img.src = url;
  await img.decode();
  plateCtx.drawImage(img, 0, 0, plate.width, plate.height);
}

window.__reel = {
  id: spec.id,
  duration: spec.duration,
  fps: spec.fps ?? 30,
  cues,
  seek: async (t) => {
    await drawPlate(seek(t));
    await new Promise((r) => requestAnimationFrame(() => r()));
  },
};
window.__ready = true;
