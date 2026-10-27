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

const mats = new Map();
/** A soft clay material, cached by colour. */
export function clay(color, { rough = 0.82, emissive = null, ei = 1, flat = false, opacity = 1 } = {}) {
  const key = `${color}|${rough}|${emissive}|${ei}|${flat}|${opacity}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: flat });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; }
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
  const top = mesh(wobbleRim(new THREE.CylinderGeometry(r, r * 0.98, 0.34, 72, 1), r, seed), clay(biome.top));
  top.position.y = -0.17;
  const soil = mesh(wobbleRim(new THREE.CylinderGeometry(r * 0.98, r * 0.78, 1.3, 72, 2), r, seed, 0.08), clay(biome.soil));
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
    const blobs = 4 + Math.floor(R() * 3);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + R();
      const rr = 0.42 + R() * 0.22;
      g.add(at(ball(rr, pick(R, cols)), Math.cos(a) * 0.32, trunkH + 0.25 + R() * 0.45, Math.sin(a) * 0.32));
    }
    g.add(at(ball(0.5, pick(R, cols)), 0, trunkH + 0.65, 0));
  }
  g.scale.setScalar(scale);
  // A gentle sway.
  g.userData.tick = (t) => { g.rotation.z = Math.sin(t * 0.9 + seed) * 0.015; };
  return g;
}

export function bush(color = "#5dbb63", seed = 1, s = 1) {
  const R = rng(seed);
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(at(ball(0.22 + R() * 0.1, color), (R() - 0.5) * 0.35, 0.18, (R() - 0.5) * 0.35));
  g.scale.setScalar(s);
  return g;
}

/** A scatter of tiny flowers over a disc. */
export function flowers(count, radius, seed = 1, colors = PALETTE.flowers) {
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
    m.makeScale(r, r, r).setPosition(Math.cos(a) * d, 0.05, Math.sin(a) * d);
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
  g.scale.setScalar(s);
  return g;
}

// ---------------------------------------------------------------- people

export const LOOKS = {
  photographer: { skin: "#e7b48e", hair: "#3a2820", top: "#4f7fd1", bottom: "#2f2a33", shoe: "#1d191f" },
  bride: { skin: "#f0c4a2", hair: "#6b3f26", top: "#ffffff", bottom: "#ffffff", shoe: "#ffffff", dress: true },
  groom: { skin: "#b9805a", hair: "#2b1d16", top: "#2d3550", bottom: "#2d3550", shoe: "#1d191f" },
  mom: { skin: "#f2c3a0", hair: "#c46a3a", top: "#2fa8a6", bottom: "#3a4b8c", shoe: "#5a3424" },
  dad: { skin: "#8a5a3c", hair: "#1d1410", top: "#f2b23a", bottom: "#4a4f5c", shoe: "#2a2420" },
  kid: { skin: "#e9b896", hair: "#7a4a2a", top: "#ff6b8b", bottom: "#3a6fd1", shoe: "#ffffff", scale: 0.62 },
  guestA: { skin: "#d9a07a", hair: "#2a1d16", top: "#ff9a5a", bottom: "#ff9a5a", shoe: "#3a2a20", dress: true },
  guestB: { skin: "#f0c8a8", hair: "#e0b25a", top: "#6ec9ff", bottom: "#33405e", shoe: "#1d191f" },
  guestC: { skin: "#7a4a32", hair: "#160f0c", top: "#b493ff", bottom: "#b493ff", shoe: "#2a2420", dress: true },
  guestD: { skin: "#e8b08a", hair: "#4a2a1a", top: "#5dbb63", bottom: "#2f2a33", shoe: "#1d191f" },
  guestE: { skin: "#c48a62", hair: "#2a1d16", top: "#ffd257", bottom: "#ff6b8b", shoe: "#2a2420", dress: true },
};

/**
 * A clay person, about 1.7 tall, with pivoting limbs.
 * Returns the group; its userData.parts holds hips, legs, arms and head for posing.
 */
export function person(look = LOOKS.guestB, { camera = false } = {}) {
  const g = new THREE.Group();
  const hips = at(new THREE.Group(), 0, 0.82, 0);
  g.add(hips);
  const legs = [];
  for (const sx of [-0.1, 0.1]) {
    const leg = at(new THREE.Group(), sx, 0, 0);
    leg.add(at(capsule(0.075, 0.6, look.dress ? look.skin : look.bottom), 0, -0.38, 0));
    leg.add(at(rbox(0.13, 0.08, 0.22, look.shoe, 0.03), 0, -0.78, 0.04));
    hips.add(leg);
    legs.push(leg);
  }
  const torso = look.dress
    ? at(cone(0.36, 0.95, look.top, 28), 0, 0.12, 0)
    : at(capsule(0.19, 0.38, look.top), 0, 0.38, 0);
  hips.add(torso);
  if (look.dress) hips.add(at(capsule(0.15, 0.28, look.top), 0, 0.5, 0));
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = at(new THREE.Group(), sx * 0.24, 0.66, 0);
    arm.add(at(capsule(0.06, 0.42, look.dress ? look.skin : look.top), 0, -0.25, 0));
    arm.add(at(ball(0.065, look.skin), 0, -0.52, 0));
    arm.rotation.z = sx * 0.12;
    hips.add(arm);
    arms.push(arm);
  }
  const head = at(new THREE.Group(), 0, 0.98, 0);
  head.add(ball(0.17, look.skin));
  const hair = ball(0.18, look.hair);
  hair.scale.set(1.02, 0.8, 1.05);
  hair.position.set(0, 0.06, -0.03);
  head.add(hair);
  for (const sx of [-0.06, 0.06]) head.add(at(ball(0.018, "#1d1410", { cast: false }), sx, 0.01, 0.16));
  hips.add(head);
  if (camera) {
    // The camera held up to the eye, in front of the face.
    const cam = new THREE.Group();
    cam.add(rbox(0.22, 0.14, 0.12, "#26222a", 0.03));
    const lens = cyl(0.05, 0.055, 0.12, "#111", 20);
    lens.rotation.x = Math.PI / 2;
    cam.add(at(lens, 0, -0.005, 0.11));
    cam.add(at(rbox(0.06, 0.04, 0.05, "#26222a", 0.01), -0.06, 0.09, 0));
    at(cam, 0, 0.98, 0.26);
    hips.add(cam);
    g.userData.cameraObj = cam;
  }
  g.scale.setScalar(look.scale ?? 1);
  g.userData.parts = { hips, legs, arms, head, torso };
  return g;
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
  const g = new THREE.Group();
  const body = capsule(0.16, 0.38, color);
  body.rotation.z = Math.PI / 2;
  g.add(at(body, 0, 0.36, 0));
  for (const [x, z] of [[-0.2, -0.09], [-0.2, 0.09], [0.2, -0.09], [0.2, 0.09]]) g.add(at(cyl(0.045, 0.045, 0.24, color), x, 0.12, z));
  const head = at(new THREE.Group(), 0.36, 0.52, 0);
  head.add(ball(0.15, color));
  head.add(at(ball(0.07, "#f3d7b8"), 0.13, -0.03, 0));
  head.add(at(ball(0.025, "#1d1410"), 0.2, 0, 0));
  for (const z of [-0.1, 0.1]) {
    const ear = ball(0.07, "#8a5228");
    ear.scale.set(0.6, 1.3, 0.5);
    head.add(at(ear, -0.03, 0.06, z));
  }
  g.add(head);
  const tail = at(new THREE.Group(), -0.34, 0.45, 0);
  const tl = capsule(0.03, 0.2, color);
  tl.position.y = 0.1;
  tail.add(tl);
  g.add(tail);
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
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
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
