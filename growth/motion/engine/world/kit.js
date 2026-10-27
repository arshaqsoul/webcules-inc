// The world kit: everything a miniature 3D world is built from.
// Soft clay materials, floating islands, trees, people, animals, props and
// particles, in the spirit of the Airbnb "airbnb it." / Experiences films:
// tiny, tactile, colourful, lit like a set.
//
// Every builder returns a THREE.Group. Anything that moves stores
// group.userData.tick = (t) => {...}, a pure function of time, so a frame
// renders the same however it is reached.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// ---------------------------------------------------------------- basics

// ---------------------------------------------------------------- painted surfaces

// Surface detail painted once in ComfyUI (growth/motion/assets.mjs, assets/tex/*.jpg).
// Each image becomes a grey detail map around 1.0, so it adds brush dabs, grain or
// thumbprints while the colour always comes from code. Missing files leave plain clay.
const SURFACES = {
  clay: { file: "clay.jpg", seamless: true, mean: 0.5, k: 2.2, repeat: 2, bump: 1.2 }, // thumbprints, for big pieces only: on a head they shrink to noise
  grass: { file: "grass.jpg", seamless: true, mean: 0.9, k: 1.6, repeat: 3 },
  wood: { file: "wood.jpg", seamless: false, mean: 0.9, k: 1.1, repeat: 1 },
  fabric: { file: "fabric.jpg", seamless: true, mean: 0.95, k: 2.0, repeat: 2 },
};
const DETAIL = {};

/** Load the painted surfaces before any world is built (clay() reads them). */
export async function loadSurfaces(asset) {
  await Promise.all(Object.entries(SURFACES).map(async ([name, s]) => {
    const img = new Image();
    img.src = asset(`growth/motion/assets/tex/${s.file}`);
    try { await img.decode(); } catch { return; }
    DETAIL[name] = detailMap(img, s);
  }));
}

/**
 * An image -> a grey, mean-centred, optionally seamless texture. Seamless: the
 * image half-shifted on both axes shows near the edges and the original in the
 * middle, so the wrap is continuous (fine for organic dabs, not for planks).
 */
function detailMap(img, { seamless, mean, k, repeat }) {
  const n = img.width;
  const h = img.height;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const src = g.getImageData(0, 0, n, h).data;
  const lum = new Float32Array(n * h);
  let sum = 0;
  for (let i = 0; i < n * h; i++) sum += lum[i] = (0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2]) / 255;
  const mu = sum / (n * h);
  const out = g.createImageData(n, h);
  const edge = (u) => clamp01((Math.abs(u - 0.5) - 0.3) / 0.2);
  for (let y = 0; y < h; y++) for (let x = 0; x < n; x++) {
    let l = lum[y * n + x];
    if (seamless) {
      const m = Math.max(edge(x / n), edge(y / h));
      l = l * (1 - m) + lum[((y + h / 2) % h) * n + ((x + n / 2) % n)] * m;
    }
    const o = (y * n + x) * 4;
    out.data[o] = out.data[o + 1] = out.data[o + 2] = Math.round(255 * clamp01(mean + (l - mu) * k));
    out.data[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** A painted surface's detail texture, optionally with its own repeat (null when not loaded). */
export function surface(name, repeat) {
  if (!DETAIL[name]) return null;
  if (repeat == null) return DETAIL[name];
  const t = DETAIL[name].clone();
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- basics

const mats = new Map();
/** A soft clay material, cached by colour. `surface` adds a painted detail map (wood, fabric, grass) or bump (clay). */
export function clay(color, { rough = 0.82, emissive = null, ei = 1, flat = false, opacity = 1, surface: sf = null } = {}) {
  const key = `${color}|${rough}|${emissive}|${ei}|${flat}|${opacity}|${sf}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: flat });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; }
    if (sf && DETAIL[sf]) {
      if (SURFACES[sf].bump) { m.bumpMap = DETAIL[sf]; m.bumpScale = SURFACES[sf].bump; }
      else m.map = DETAIL[sf];
    }
    mats.set(key, m);
  }
  return mats.get(key);
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export const at = (obj, x = 0, y = 0, z = 0) => (obj.position.set(x, y, z), obj);
export const group = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => k && g.add(k)); return g; };
export const rbox = (w, h, d, color, r = 0.06, opts) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), clay(color, opts));
export const ball = (r, color, opts) => mesh(new THREE.SphereGeometry(r, 24, 16), clay(color, opts));
export const cyl = (rt, rb, h, color, seg = 24, opts) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), clay(color, opts));
export const cone = (r, h, color, seg = 20, opts) => mesh(new THREE.ConeGeometry(r, h, seg), clay(color, opts));
export const capsule = (r, len, color, opts) => mesh(new THREE.CapsuleGeometry(r, len, 6, 14), clay(color, opts));

/** Seeded PRNG so worlds are built the same every run. */
export function rng(seed) {
  let a = typeof seed === "string" ? [...seed].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0), 7) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

/** Run every tick in a tree of objects. */
export function tickAll(root, t) {
  root.traverse((o) => o.userData.tick && o.userData.tick(t));
}

// ---------------------------------------------------------------- glow sprites

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
/** An additive glow: bulbs, flashes, fireflies, the sun. */
export function glow(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

// ---------------------------------------------------------------- contact shadows

let contactTex = null;
/**
 * A soft dark pool on the ground under a thing: the contact shadow that makes
 * a miniature sit on its set (cheaper and steadier than screen-space AO).
 */
export function contact(rx, rz = rx, opacity = 0.32) {
  if (!contactTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(40,24,40,1)");
    grd.addColorStop(0.45, "rgba(40,24,40,0.55)");
    grd.addColorStop(1, "rgba(40,24,40,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    contactTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- terrain

/** Wobble a cylinder's rim so islands look hand-made, not lathed. */
function wobbleRim(geo, r, seed, amt = 0.07) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const k = 1 + amt * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 7 + seed * 2.1) * 0.3 + Math.sin(a * 13 + seed * 0.7) * 0.1);
    p.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A floating island: a grass (or sand, or snow) top, a thick soil layer and a
 * craggy rock underside, with a few hanging roots and pebbles.
 * biome: { top, soil, rock }
 */
export function island(r, biome, seed = 1) {
  const g = new THREE.Group();
  // The top is painted with soft patches of lighter and darker grass, like a hand-painted set.
  const topGeo = wobbleRim(new THREE.CylinderGeometry(r, r * 0.98, 0.34, 96, 1), r, seed);
  const base = new THREE.Color(biome.top);
  const paint = (geo) => {
    const p = geo.attributes.position;
    const cols = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const n = Math.sin(x * 1.3 + seed) * Math.cos(z * 1.1 - seed) * 0.5 + Math.sin(x * 2.9 - z * 2.3 + seed * 3) * 0.25;
      c.copy(base).offsetHSL(0, 0.02 * n, 0.06 * n);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  };
  const topMat = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.85, map: surface("grass", Math.max(2, r * 0.7)) });
  const top = mesh(topGeo, clay(biome.top));
  // A finely divided disc on the top face carries the painted patches.
  const fine = wobbleRim(new THREE.RingGeometry(0.001, r * 0.985, 96, 24).rotateX(-Math.PI / 2), r, seed);
  paint(fine);
  const face = mesh(fine, topMat, { cast: false });
  face.position.y = 0.172;
  top.add(face);
  top.position.y = -0.17;
  const soil = mesh(wobbleRim(new THREE.CylinderGeometry(r * 0.98, r * 0.78, 1.3, 72, 2), r, seed, 0.08), clay(biome.soil, { surface: "clay" }));
  soil.position.y = -0.34 - 0.65;
  const under = new THREE.ConeGeometry(r * 0.78, r * 1.05, 14, 3);
  const pp = under.attributes.position;
  const R = rng(seed * 97);
  for (let i = 0; i < pp.count; i++) {
    const y = pp.getY(i);
    if (y < r * 0.52 - 0.01) {
      const k = 0.82 + R() * 0.32;
      pp.setXYZ(i, pp.getX(i) * k, y + (R() - 0.5) * 0.25, pp.getZ(i) * k);
    }
  }
  under.computeVertexNormals();
  const rock = mesh(under, clay(biome.rock, { flat: true }));
  rock.rotation.x = Math.PI;
  rock.position.y = -1.64 - r * 0.52;
  g.add(top, soil, rock);
  // A darker grass lip catches the light at the rim.
  const lip = mesh(wobbleRim(new THREE.TorusGeometry(r * 0.985, 0.06, 6, 72), r, seed), clay(biome.lip ?? biome.top));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.02;
  g.add(lip);
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    const p = ball(0.12 + R() * 0.18, biome.rock, { flat: true });
    p.position.set(Math.cos(a) * r * 0.86, -1.2 - R() * 0.6, Math.sin(a) * r * 0.86);
    g.add(p);
  }
  return g;
}

// ---------------------------------------------------------------- plants

export const PALETTE = {
  autumn: ["#ef6a2c", "#f59a2a", "#d9412b", "#f7c447", "#c9542a"],
  green: ["#5dbb63", "#76cc6b", "#4aa557", "#8bd877"],
  blossom: ["#ffb3cf", "#ff9cc2", "#ffc9dc", "#ffd6e6"],
  pine: ["#2f7d5b", "#3a8f66", "#2a6e51"],
  flowers: ["#ff6b8b", "#ffd257", "#ffffff", "#b493ff", "#ff9a5a", "#6ec9ff"],
};

/** A lumpy, hand-sculpted blob: an icosphere pushed in and out by smooth noise. */
const blobGeos = new Map();
export function blob(r, color, seed = 1, lump = 0.12) {
  const key = `${seed % 8}|${lump}`;
  if (!blobGeos.has(key)) {
    const geo = new THREE.SphereGeometry(1, 48, 32); // indexed, so the lumps shade smooth
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    const k = (seed % 8) * 1.7;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 3.1 + k) * Math.sin(v.y * 2.7 + k * 0.6) * Math.sin(v.z * 3.3 + k * 1.3) + 0.5 * Math.sin(v.x * 6.3 + v.z * 5.1 + k);
      v.multiplyScalar(1 + lump * n);
      if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.45; // a softly flattened underside
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    blobGeos.set(key, geo);
  }
  const m = mesh(blobGeos.get(key), clay(color));
  m.scale.setScalar(r);
  return m;
}

/** A tree. kind: "round" | "autumn" | "blossom" | "pine". */
export function tree(kind = "round", seed = 1, scale = 1) {
  const R = rng(seed);
  const g = new THREE.Group();
  if (kind === "pine") {
    g.add(at(cyl(0.09, 0.13, 0.7, "#6b4430"), 0, 0.35, 0));
    const col = pick(R, PALETTE.pine);
    for (let i = 0; i < 3; i++) g.add(at(cone(0.75 - i * 0.18, 0.95, col, 18), 0, 0.9 + i * 0.5, 0));
  } else {
    const trunkH = 0.9 + R() * 0.4;
    g.add(at(cyl(0.08, 0.13, trunkH, "#7a4b30"), 0, trunkH / 2, 0));
    const branch = cyl(0.04, 0.06, 0.5, "#7a4b30");
    branch.rotation.z = 0.7;
    g.add(at(branch, 0.15, trunkH * 0.7, 0));
    const cols = kind === "autumn" ? PALETTE.autumn : kind === "blossom" ? PALETTE.blossom : PALETTE.green;
    // A canopy of sculpted lumps: a big core, a ring of mid lumps, small ones on top.
    const main = pick(R, cols);
    g.add(at(blob(0.62, main, seed), 0, trunkH + 0.55, 0));
    const ring = 5 + Math.floor(R() * 3);
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + R() * 0.5;
      const c = R() < 0.6 ? main : pick(R, cols);
      g.add(at(blob(0.34 + R() * 0.16, c, seed + i + 1), Math.cos(a) * 0.48, trunkH + 0.3 + R() * 0.35, Math.sin(a) * 0.48));
    }
    for (let i = 0; i < 3; i++) {
      const a = R() * Math.PI * 2;
      g.add(at(blob(0.26 + R() * 0.1, pick(R, cols), seed + 9 + i), Math.cos(a) * 0.22, trunkH + 0.95 + R() * 0.2, Math.sin(a) * 0.22));
    }
  }
  g.add(contact(kind === "pine" ? 0.8 : 0.85, undefined, 0.28));
  g.scale.setScalar(scale);
  // A gentle sway.
  g.userData.tick = (t) => { g.rotation.z = Math.sin(t * 0.9 + seed) * 0.015; };
  return g;
}

export function bush(color = "#5dbb63", seed = 1, s = 1) {
  const R = rng(seed);
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) g.add(at(blob(0.2 + R() * 0.1, color, seed + i), (R() - 0.5) * 0.4, 0.17 + R() * 0.06, (R() - 0.5) * 0.4));
  g.add(contact(0.42, undefined, 0.28));
  g.scale.setScalar(s);
  return g;
}

/** A scatter of tiny flowers over a disc. */
export function flowers(count, radius, seed = 1, colors = PALETTE.flowers, { flat = false } = {}) {
  // One instanced mesh: hundreds of petals for one draw call.
  const R = rng(seed);
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
  inst.receiveShadow = true;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * radius;
    const r = 0.05 + R() * 0.03;
    if (flat) {
      // Fallen leaves: flat ovals lying at random angles.
      m.compose(new THREE.Vector3(Math.cos(a) * d, 0.015, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * Math.PI * 2, 0)), new THREE.Vector3(r * 1.9, r * 0.18, r * 1.1));
    } else m.makeScale(r, r, r).setPosition(Math.cos(a) * d, 0.05, Math.sin(a) * d);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, c.set(pick(R, colors)));
  }
  return inst;
}

export function pumpkin(s = 1) {
  const g = new THREE.Group();
  const b = ball(0.22, "#f28a2e");
  b.scale.set(1.15, 0.8, 1.15);
  g.add(at(b, 0, 0.17, 0));
  g.add(at(cyl(0.025, 0.035, 0.12, "#5a7a3a"), 0, 0.38, 0));
  g.add(contact(0.32, undefined, 0.35));
  g.scale.setScalar(s);
  return g;
}

// ---------------------------------------------------------------- people

export const LOOKS = {
  photographer: { skin: "#e7b48e", hair: "#3a2820", hairStyle: "bun", top: "#4f7fd1", bottom: "#2f2a33", shoe: "#f4efe6", strap: "#d9a441" },
  bride: { skin: "#f0c4a2", hair: "#6b3f26", hairStyle: "bun", top: "#ffffff", bottom: "#ffffff", shoe: "#ffffff", dress: true, veil: true },
  groom: { skin: "#b9805a", hair: "#2b1d16", hairStyle: "short", top: "#2d3550", bottom: "#2d3550", shoe: "#1d191f", tie: "#ff8fb1" },
  mom: { skin: "#f2c3a0", hair: "#c46a3a", hairStyle: "long", top: "#2fa8a6", bottom: "#3a4b8c", shoe: "#5a3424" },
  dad: { skin: "#8a5a3c", hair: "#1d1410", hairStyle: "curly", top: "#f2b23a", bottom: "#4a4f5c", shoe: "#2a2420" },
  kid: { skin: "#e9b896", hair: "#7a4a2a", hairStyle: "short", top: "#ff6b8b", bottom: "#3a6fd1", shoe: "#ffffff", scale: 0.62, kid: true },
  guestA: { skin: "#d9a07a", hair: "#2a1d16", hairStyle: "long", top: "#ff9a5a", bottom: "#ff9a5a", shoe: "#3a2a20", dress: true },
  guestB: { skin: "#f0c8a8", hair: "#e0b25a", hairStyle: "short", top: "#6ec9ff", bottom: "#33405e", shoe: "#1d191f" },
  guestC: { skin: "#7a4a32", hair: "#160f0c", hairStyle: "curly", top: "#b493ff", bottom: "#b493ff", shoe: "#2a2420", dress: true },
  guestD: { skin: "#e8b08a", hair: "#4a2a1a", hairStyle: "short", top: "#5dbb63", bottom: "#2f2a33", shoe: "#1d191f" },
  guestE: { skin: "#c48a62", hair: "#2a1d16", hairStyle: "bun", top: "#ffd257", bottom: "#ff6b8b", shoe: "#2a2420", dress: true },
};

/** A smooth turned shape from a profile of [radius, y] pairs (bodies, dresses, vases). */
export function lathe(profile, color, opts) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return mesh(new THREE.LatheGeometry(pts, 32), clay(color, opts));
}

/** A hairstyle on a head of radius r. */
function hairdo(look, r) {
  const g = new THREE.Group();
  const c = look.hair;
  // A cap that covers the crown and the back of the head, leaving the face clear.
  const cap = mesh(new THREE.SphereGeometry(r * 1.07, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), clay(c));
  cap.rotation.x = -0.35;
  g.add(cap);
  const fringe = ball(r * 0.55, c);
  fringe.scale.set(1.5, 0.55, 0.8);
  g.add(at(fringe, r * 0.15, r * 0.62, r * 0.55));
  if (look.hairStyle === "long") {
    const back = capsule(r * 0.82, r * 1.1, c);
    back.scale.z = 0.6;
    g.add(at(back, 0, -r * 0.45, -r * 0.55));
  } else if (look.hairStyle === "bun") {
    g.add(at(ball(r * 0.45, c), 0, r * 0.75, -r * 0.7));
  } else if (look.hairStyle === "curly") {
    const R = rng(c);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      g.add(at(ball(r * (0.36 + R() * 0.1), c), Math.cos(a) * r * 0.8, r * (0.55 + R() * 0.25), Math.sin(a) * r * 0.8 - r * 0.15));
    }
  }
  return g;
}

/**
 * A clay person, about 1.7 tall, with pivoting limbs: turned body, round head
 * with a face (eyes, glints, nose, cheeks, ears, brows), a hairstyle, hands and
 * rounded shoes, in the proportions of the Airbnb film characters.
 * Returns the group; its userData.parts holds hips, legs, arms and head for posing.
 */
export function person(look = LOOKS.guestB, { camera = false } = {}) {
  const g = new THREE.Group();
  const hips = at(new THREE.Group(), 0, 0.82, 0);
  g.add(hips);
  const legs = [];
  for (const sx of [-0.095, 0.095]) {
    const leg = at(new THREE.Group(), sx, 0, 0);
    // A tapered leg, wider at the thigh, ending in a round shoe.
    leg.add(at(lathe([[0, -0.72], [0.066, -0.71], [0.07, -0.4], [0.088, -0.1], [0.08, 0], [0, 0.02]], look.dress ? look.skin : look.bottom), 0, 0, 0));
    const shoe = capsule(0.068, 0.1, look.shoe);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1, 1, 0.75);
    leg.add(at(shoe, 0, -0.76, 0.05));
    hips.add(leg);
    legs.push(leg);
  }
  // Pelvis and a turned torso: waist, chest, round shoulders.
  if (!look.dress) hips.add(at(rbox(0.34, 0.2, 0.24, look.bottom, 0.09), 0, 0.02, 0));
  const torso = lathe([[0, 0.06], [0.165, 0.08], [0.17, 0.2], [0.205, 0.44], [0.19, 0.6], [0.12, 0.7], [0.06, 0.72], [0, 0.72]], look.top);
  torso.scale.z = 0.78;
  hips.add(torso);
  if (look.dress) {
    // A bell skirt from the waist to the shins.
    const skirt = lathe([[0, 0.14], [0.17, 0.14], [0.2, 0.0], [0.3, -0.35], [0.38, -0.6], [0.36, -0.64], [0, -0.64]], look.top);
    skirt.scale.z = 0.85;
    hips.add(skirt);
  }
  if (look.tie) hips.add(at(rbox(0.05, 0.22, 0.03, look.tie, 0.015), 0, 0.5, 0.155));
  if (look.strap) {
    // The camera strap across the chest.
    const strap = mesh(new THREE.TorusGeometry(0.21, 0.018, 6, 28), clay(look.strap));
    strap.rotation.set(0, 0, 0.8);
    strap.scale.z = 0.82;
    hips.add(at(strap, 0, 0.42, 0));
  }
  hips.add(at(cyl(0.06, 0.07, 0.12, look.skin, 16), 0, 0.76, 0));
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = at(new THREE.Group(), sx * 0.235, 0.62, 0);
    arm.add(at(ball(0.07, look.dress ? look.skin : look.top), 0, 0, 0));
    arm.add(at(lathe([[0, -0.46], [0.052, -0.45], [0.056, -0.2], [0.066, 0], [0, 0.02]], look.dress ? look.skin : look.top), 0, 0, 0));
    if (!look.dress) arm.add(at(cyl(0.058, 0.058, 0.04, look.skin, 14), 0, -0.47, 0));
    const hand = ball(0.062, look.skin);
    hand.scale.set(0.85, 1.05, 0.9);
    arm.add(at(hand, 0, -0.53, 0));
    arm.rotation.z = sx * 0.1;
    hips.add(arm);
    arms.push(arm);
  }
  const hr = look.kid ? 0.24 : 0.2;
  const head = at(new THREE.Group(), 0, 0.82 + hr, 0);
  const skull = ball(hr, look.skin);
  skull.scale.set(1, 1.04, 0.98);
  head.add(skull);
  // Face: eyes with a glint, brows, a button nose, rosy cheeks, ears.
  for (const sx of [-1, 1]) {
    const eye = ball(hr * 0.11, "#20171a");
    eye.scale.set(0.9, 1.25, 0.6);
    head.add(at(eye, sx * hr * 0.36, hr * 0.06, hr * 0.92));
    head.add(at(ball(hr * 0.035, "#ffffff", { emissive: "#ffffff", ei: 0.6 }), sx * hr * 0.36 + hr * 0.03, hr * 0.11, hr * 0.97));
    const brow = capsule(hr * 0.035, hr * 0.14, look.hair);
    brow.rotation.z = Math.PI / 2 + sx * 0.15;
    head.add(at(brow, sx * hr * 0.37, hr * 0.33, hr * 0.88));
    const cheek = ball(hr * 0.16, "#ff8f8f", { opacity: 0.55 });
    cheek.scale.set(1, 0.6, 0.3);
    head.add(at(cheek, sx * hr * 0.58, -hr * 0.2, hr * 0.76));
    const ear = ball(hr * 0.2, look.skin);
    ear.scale.set(0.45, 1, 0.8);
    head.add(at(ear, sx * hr * 0.98, -hr * 0.02, 0));
  }
  head.add(at(ball(hr * 0.13, mixColor(look.skin, "#d4886a", 0.35)), 0, -hr * 0.12, hr * 1.0));
  const smile = mesh(new THREE.TorusGeometry(hr * 0.16, hr * 0.03, 6, 16, Math.PI), clay("#7a2e2e"), { cast: false });
  smile.rotation.z = Math.PI;
  head.add(at(smile, 0, -hr * 0.32, hr * 0.9));
  head.add(hairdo(look, hr));
  if (look.veil) {
    const veil = lathe([[0.02, 0.1], [0.12, 0.05], [0.26, -0.5], [0.3, -0.75]], "#ffffff", { opacity: 0.7 });
    veil.scale.z = 0.6;
    head.add(at(veil, 0, hr * 0.7, -hr * 0.55));
  }
  hips.add(head);
  if (camera) {
    // The camera held up to the eye, in front of the face.
    const cam = new THREE.Group();
    cam.add(rbox(0.24, 0.15, 0.12, "#26222a", 0.035));
    cam.add(at(rbox(0.07, 0.15, 0.1, "#26222a", 0.03), 0.11, -0.01, 0.02));
    const lens = cyl(0.058, 0.062, 0.14, "#18161a", 24);
    lens.rotation.x = Math.PI / 2;
    cam.add(at(lens, 0, -0.005, 0.12));
    const glass = cyl(0.045, 0.045, 0.01, "#5a7fd1", 20, { rough: 0.15 });
    glass.rotation.x = Math.PI / 2;
    cam.add(at(glass, 0, -0.005, 0.19));
    cam.add(at(rbox(0.07, 0.045, 0.06, "#26222a", 0.012), -0.05, 0.095, 0));
    cam.add(at(cyl(0.02, 0.02, 0.02, "#e64a3c", 12), 0.08, 0.085, 0.02));
    at(cam, 0, 0.82 + hr - 0.01, hr + 0.1);
    hips.add(cam);
    g.userData.cameraObj = cam;
  }
  g.add(contact(0.32, 0.26, 0.38));
  g.scale.setScalar(look.scale ?? 1);
  g.userData.parts = { hips, legs, arms, head, torso };
  return g;
}

/** Mix two hex colours. */
function mixColor(a, b, k) {
  return "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
}

/** Poses: each sets limb rotations for time t. Pure functions of t. */
export const pose = {
  stand(p, t, seed = 0) {
    const { hips, head } = p.userData.parts;
    hips.position.y = 0.82 + Math.sin(t * 1.6 + seed) * 0.006;
    head.rotation.y = Math.sin(t * 0.5 + seed) * 0.15;
  },
  shoot(p, t, seed = 0) {
    const { arms, head, hips } = p.userData.parts;
    hips.position.y = 0.82 + Math.sin(t * 1.3 + seed) * 0.005;
    arms[0].rotation.set(-1.45, 0, 0.35);
    arms[1].rotation.set(-1.45, 0, -0.35);
    head.rotation.x = 0.05;
  },
  wave(p, t, seed = 0) {
    const { arms } = p.userData.parts;
    arms[1].rotation.set(0, 0, -2.4 + Math.sin(t * 7 + seed) * 0.35);
  },
  dance(p, t, seed = 0) {
    const { hips, arms, legs, head } = p.userData.parts;
    const b = Math.sin(t * 7 + seed);
    hips.position.y = 0.8 + Math.abs(b) * 0.08;
    hips.rotation.y = Math.sin(t * 3.5 + seed) * 0.4;
    arms[0].rotation.set(0, 0, 2.3 + b * 0.5);
    arms[1].rotation.set(0, 0, -2.3 + b * 0.5);
    legs[0].rotation.x = b * 0.25;
    legs[1].rotation.x = -b * 0.25;
    head.rotation.z = b * 0.12;
  },
  sit(p, t, seed = 0) {
    const { hips, legs, arms } = p.userData.parts;
    hips.position.y = 0.42;
    legs[0].rotation.x = -1.45;
    legs[1].rotation.x = -1.45;
    arms[0].rotation.set(-0.5, 0, 0.2);
    arms[1].rotation.set(-0.5 + Math.sin(t * 2 + seed) * 0.05, 0, -0.2);
  },
  hold(p, t, seed = 0) {
    // Arms reaching forward, as for holding hands with someone facing.
    const { arms, hips } = p.userData.parts;
    hips.position.y = 0.82 + Math.sin(t * 1.4 + seed) * 0.005;
    arms[0].rotation.set(-0.9, 0, 0.25);
    arms[1].rotation.set(-0.9, 0, -0.25);
  },
  jump(p, t, seed = 0) {
    const { hips, arms } = p.userData.parts;
    const h = Math.max(0, Math.sin(t * 5 + seed));
    hips.position.y = 0.82 + h * 0.35;
    arms[0].rotation.set(0, 0, 2.6 * h + 0.2);
    arms[1].rotation.set(0, 0, -2.6 * h - 0.2);
  },
};

/** A person with a pose function bound into its tick. */
export function actor(look, poseName, { seed = 0, camera = false } = {}) {
  const p = person(look, { camera });
  p.userData.tick = (t) => pose[poseName](p, t, seed);
  pose[poseName](p, 0, seed);
  return p;
}

// ---------------------------------------------------------------- animals and babies

export function dog(color = "#d98c4a", seed = 0) {
  // A round, friendly pup: chunky body, big head, a snout, floppy ears, a wagging tail.
  const g = new THREE.Group();
  const patch = mixColor(color, "#ffffff", 0.55);
  const body = capsule(0.17, 0.3, color);
  body.rotation.z = Math.PI / 2;
  g.add(at(body, 0, 0.36, 0));
  const belly = capsule(0.12, 0.2, patch);
  belly.rotation.z = Math.PI / 2;
  g.add(at(belly, 0.02, 0.3, 0));
  for (const [x, z] of [[-0.17, -0.09], [-0.17, 0.09], [0.17, -0.09], [0.17, 0.09]]) {
    g.add(at(capsule(0.052, 0.16, color), x, 0.15, z));
    g.add(at(ball(0.058, patch), x + 0.015, 0.04, z));
  }
  const head = at(new THREE.Group(), 0.3, 0.6, 0);
  head.add(ball(0.17, color));
  const snout = capsule(0.075, 0.06, patch);
  snout.rotation.z = Math.PI / 2;
  head.add(at(snout, 0.15, -0.05, 0));
  head.add(at(ball(0.035, "#2a1d1a"), 0.235, -0.02, 0));
  for (const z of [-1, 1]) {
    head.add(at(ball(0.025, "#20171a"), 0.12, 0.05, z * 0.08));
    const ear = ball(0.08, mixColor(color, "#3a2218", 0.35));
    ear.scale.set(0.5, 1.25, 0.6);
    ear.rotation.x = z * 0.3;
    head.add(at(ear, -0.02, 0.0, z * 0.15));
  }
  const tongue = ball(0.03, "#ff7a8a");
  tongue.scale.set(1, 0.4, 1.2);
  head.add(at(tongue, 0.17, -0.11, 0));
  g.add(head);
  const tail = at(new THREE.Group(), -0.3, 0.45, 0);
  const tl = capsule(0.03, 0.16, color);
  tl.position.y = 0.09;
  tail.add(tl);
  g.add(tail);
  g.add(contact(0.5, 0.25, 0.35));
  g.userData.tick = (t) => {
    tail.rotation.x = Math.sin(t * 14 + seed) * 0.6;
    tail.rotation.z = -0.6;
    head.rotation.z = Math.sin(t * 1.5 + seed) * 0.08;
  };
  return g;
}

/** A swaddled baby lying on a beanbag. */
export function babyOnBeanbag(blanket = "#ffd6e6") {
  const g = new THREE.Group();
  const bag = ball(0.55, "#f4ebdc");
  bag.scale.set(1.25, 0.42, 1.0);
  g.add(at(bag, 0, 0.22, 0));
  const b = capsule(0.13, 0.28, blanket);
  b.rotation.z = Math.PI / 2;
  g.add(at(b, 0, 0.48, 0));
  g.add(at(ball(0.12, "#f2c8a8"), 0.3, 0.5, 0));
  const hat = ball(0.125, "#bfe3ff");
  hat.scale.set(1, 0.7, 1);
  g.add(at(hat, 0.33, 0.56, 0));
  g.userData.tick = (t) => { b.scale.y = 1 + Math.sin(t * 2.2) * 0.03; };
  return g;
}

// ---------------------------------------------------------------- props

export function chair(color = "#ffffff") {
  const g = new THREE.Group();
  g.add(at(rbox(0.42, 0.06, 0.4, color, 0.02), 0, 0.42, 0));
  g.add(at(rbox(0.42, 0.42, 0.05, color, 0.02), 0, 0.66, -0.18));
  for (const [x, z] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]]) g.add(at(cyl(0.02, 0.02, 0.42, color, 8), x, 0.21, z));
  return g;
}

export function roundTable(cloth = "#ffffff", r = 0.6) {
  const g = new THREE.Group();
  g.add(at(cyl(r, r + 0.08, 0.7, cloth, 32), 0, 0.35, 0));
  g.add(at(cyl(r + 0.02, r + 0.02, 0.04, cloth, 32), 0, 0.71, 0));
  return g;
}

export function cake() {
  const g = new THREE.Group();
  g.add(at(cyl(0.22, 0.22, 0.16, "#fff3f6", 24), 0, 0.08, 0));
  g.add(at(cyl(0.15, 0.15, 0.13, "#ffc9dc", 24), 0, 0.23, 0));
  g.add(at(cyl(0.012, 0.012, 0.09, "#6ec9ff", 8), 0, 0.34, 0));
  const flame = glow("#ffb347", 0.18);
  g.add(at(flame, 0, 0.41, 0));
  g.userData.tick = (t) => { flame.material.opacity = 0.8 + Math.sin(t * 23) * 0.2; };
  return g;
}

export function balloon(color, seed = 0) {
  const g = new THREE.Group();
  const b = ball(0.2, color, { rough: 0.35 });
  b.scale.set(1, 1.18, 1);
  const line = cyl(0.006, 0.006, 1.1, "#ffffff", 4);
  g.add(at(b, 0, 1.25, 0), at(line, 0, 0.6, 0));
  g.userData.tick = (t) => { g.position.y = Math.sin(t * 1.4 + seed) * 0.06; g.rotation.z = Math.sin(t * 0.9 + seed) * 0.05; };
  return g;
}

/** Fairy lights strung between points, with glowing bulbs. */
export function stringLights(points, { sag = 0.35, bulbs = 10, color = "#ffd27a", seed = 0 } = {}) {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]);
    const b = new THREE.Vector3(...points[i + 1]);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.012, 5), clay("#2a2420"), { cast: false }));
    for (let j = 1; j < bulbs; j++) {
      const p = curve.getPoint(j / bulbs);
      const bulb = ball(0.035, color, { emissive: color, ei: 2.2, cast: false });
      bulb.position.copy(p);
      const halo = glow(color, 0.42, 0.75);
      halo.position.copy(p);
      halo.userData.tick = (t) => { halo.material.opacity = 0.6 + 0.25 * Math.sin(t * 3 + j * 1.7 + i + seed); };
      g.add(bulb, halo);
    }
  }
  return g;
}

export function pole(h = 2.6, color = "#7a4b30") {
  return at(cyl(0.035, 0.05, h, color, 10), 0, h / 2, 0);
}

/** A softbox on a stand, with a glowing face. */
export function softbox(color = "#ffffff") {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = cyl(0.015, 0.015, 0.9, "#2a2a2e", 6);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.18, 0.42, Math.sin(a) * 0.18);
    leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    g.add(leg);
  }
  g.add(at(cyl(0.018, 0.018, 1.0, "#2a2a2e", 6), 0, 1.3, 0));
  const head = at(new THREE.Group(), 0, 1.85, 0);
  head.add(rbox(0.75, 0.75, 0.32, "#2a2a2e", 0.05));
  head.add(at(mesh(new THREE.PlaneGeometry(0.66, 0.66), clay(color, { emissive: "#fff6e8", ei: 1.4 }), { cast: false }), 0, 0, 0.165));
  g.add(head);
  g.userData.head = head;
  return g;
}

/** A rug or blanket: a thin rounded slab with a canvas pattern. */
export function blanket(w, d, colors = ["#ff6b6b", "#ffffff"], check = 6) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g2 = c.getContext("2d");
  const s = 128 / check;
  for (let i = 0; i < check; i++) for (let j = 0; j < check; j++) {
    g2.fillStyle = (i + j) % 2 ? colors[0] : colors[1];
    g2.fillRect(i * s, j * s, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, bumpMap: surface("fabric", check / 2), bumpScale: 2 });
  const b = mesh(new RoundedBoxGeometry(w, 0.04, d, 2, 0.02), m, { cast: false });
  b.position.y = 0.02;
  return b;
}

/** Bunting: little flags hanging along a line. */
export function bunting(a, b, colors = PALETTE.flowers, count = 9, sag = 0.3) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const mid = A.clone().lerp(B, 0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
  g.add(mesh(new THREE.TubeGeometry(curve, 20, 0.01, 4), clay("#ffffff"), { cast: false }));
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.1, 0, 0), new THREE.Vector3(0.1, 0, 0), new THREE.Vector3(0, -0.22, 0)]);
  tri.computeVertexNormals();
  for (let i = 1; i < count; i++) {
    const f = mesh(tri, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.8 }));
    f.position.copy(curve.getPoint(i / count));
    const dir = B.clone().sub(A);
    f.rotation.y = -Math.atan2(dir.z, dir.x);
    f.userData.tick = (t) => { f.rotation.x = Math.sin(t * 2.4 + i) * 0.15; };
    g.add(f);
  }
  return g;
}

// ---------------------------------------------------------------- particles

/**
 * Falling things over an area: leaves, confetti, petals, snow.
 * Positions are a pure function of t (seeded), looping every `period` seconds.
 */
export function fall({ count = 60, area = [5, 5], height = 4, colors = PALETTE.autumn, size = [0.14, 0.09], speed = 0.6, spin = 2, seed = 1, shape = "leaf" } = {}) {
  const geo = shape === "snow" ? new THREE.SphereGeometry(0.04, 6, 4) : new THREE.PlaneGeometry(size[0], size[1]);
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8, ...(shape === "snow" ? { color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.3 } : {}) });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.castShadow = shape !== "snow";
  const R = rng(seed);
  const P = Array.from({ length: count }, () => ({ x: (R() - 0.5) * area[0], z: (R() - 0.5) * area[1], ph: R(), sw: 0.2 + R() * 0.4, rs: (R() - 0.5) * spin * 2, c: pick(R, colors) }));
  const col = new THREE.Color();
  P.forEach((p, i) => inst.setColorAt(i, col.set(p.c)));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  inst.userData.tick = (t) => {
    P.forEach((p, i) => {
      const k = (p.ph + (t * speed) / height) % 1;
      v.set(p.x + Math.sin(t * 1.3 + p.ph * 9) * p.sw, height * (1 - k), p.z + Math.cos(t * 1.1 + p.ph * 7) * p.sw * 0.6);
      e.set(t * p.rs + p.ph * 6, t * p.rs * 0.7, t * p.rs * 0.4);
      q.setFromEuler(e);
      m.compose(v, q, s);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
  };
  inst.userData.tick(0);
  return inst;
}

/** Fireflies or sparkles: glowing points that drift. */
export function sparkles(count, area, height, color = "#ffe9a8", seed = 3) {
  const g = new THREE.Group();
  const R = rng(seed);
  for (let i = 0; i < count; i++) {
    const s = glow(color, 0.25 + R() * 0.2, 0.8);
    const x0 = (R() - 0.5) * area;
    const z0 = (R() - 0.5) * area;
    const y0 = 0.4 + R() * height;
    const ph = R() * 10;
    s.userData.tick = (t) => {
      s.position.set(x0 + Math.sin(t * 0.7 + ph) * 0.3, y0 + Math.sin(t * 1.1 + ph) * 0.2, z0 + Math.cos(t * 0.6 + ph) * 0.3);
      s.material.opacity = 0.45 + 0.45 * Math.sin(t * 3 + ph);
    };
    g.add(s);
  }
  return g;
}

/** A puffy cloud: a cluster of soft white balls, flat underneath. */
export function cloud(seed = 1, scale = 1, color = "#ffffff") {
  const R = rng(seed);
  const g = new THREE.Group();
  const m = clay(color, { rough: 1, emissive: color, ei: 0.22 });
  const n = 6 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const r = 0.6 + R() * 0.7;
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
    b.position.set((R() - 0.5) * 3.2, R() * 0.5, (R() - 0.5) * 1.4);
    b.scale.y = 0.75;
    g.add(b);
  }
  g.scale.setScalar(scale);
  return g;
}
