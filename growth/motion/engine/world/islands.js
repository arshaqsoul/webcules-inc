// Island builders: one miniature world per kind of shoot.
// Each returns { group, subject, photographer } where subject is the local
// point the camera frames and photographer is the actor holding the camera
// (its userData.cameraObj is where the flash fires).
// Add a new world by adding a builder here and naming it in a spec.

import * as THREE from "three";
import {
  island, tree, bush, flowers, pumpkin, actor, LOOKS, dog, babyOnBeanbag, chair, roundTable, cake, balloon,
  stringLights, pole, softbox, blanket, bunting, fall, sparkles, rbox, cyl, ball, at, mesh, clay, glow, rng,
} from "./kit.js";

const face = (obj, [x, z]) => { obj.rotation.y = Math.atan2(x - obj.position.x, z - obj.position.z); return obj; };

function shooter(x, z, target, seed = 0) {
  const p = actor(LOOKS.photographer, "shoot", { seed, camera: true });
  p.position.set(x, 0, z);
  face(p, target);
  const flash = glow("#ffffff", 0.01, 0);
  p.userData.cameraObj.add(at(flash, 0, 0.1, 0.12));
  p.userData.flash = flash;
  return p;
}

// ------------------------------------------------------------- studio (newborn)

export function studio(seed = 11) {
  const g = new THREE.Group();
  g.add(island(4.6, { top: "#7fcf6e", soil: "#b87a4b", rock: "#8a7266", lip: "#6cbc5f" }, seed));
  // The studio: a wooden floor and two cut-away walls, like a dollhouse.
  g.add(at(rbox(4.4, 0.22, 3.6, "#e2a86c", 0.05), 0, 0.11, -0.4));
  g.add(at(rbox(4.4, 2.7, 0.16, "#fff0dc", 0.04), 0, 1.57, -2.15));
  g.add(at(rbox(0.16, 2.7, 3.6, "#ffcfb5", 0.04), -2.15, 1.57, -0.4));
  // A big window with daylight coming through.
  g.add(at(rbox(1.3, 1.1, 0.1, "#ffffff", 0.03), 1.25, 1.75, -2.06));
  g.add(at(mesh(new THREE.PlaneGeometry(1.15, 0.95), clay("#cfe9ff", { emissive: "#eaf6ff", ei: 1.1 }), { cast: false }), 1.25, 1.75, -2.0));
  g.add(at(rbox(1.2, 0.04, 0.06, "#ffffff", 0.01), 1.25, 1.75, -1.99));
  // A seamless backdrop roll and its sweep onto the floor.
  g.add(at(cyl(0.07, 0.07, 2.3, "#5a5a62", 12), -0.55, 2.62, -1.95).rotateZ(Math.PI / 2));
  g.add(at(mesh(new THREE.PlaneGeometry(2.1, 2.4), clay("#a9d3c4"), { cast: false }), -0.55, 1.42, -1.98));
  const sweep = mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.1, 16, 1, true, Math.PI, Math.PI / 2), clay("#a9d3c4", { }), { cast: false });
  sweep.material.side = THREE.DoubleSide;
  sweep.rotation.z = Math.PI / 2;
  g.add(at(sweep, -0.55, 0.67, -1.53));
  g.add(at(mesh(new THREE.PlaneGeometry(2.1, 1.1).rotateX(-Math.PI / 2), clay("#a9d3c4"), { cast: false }), -0.55, 0.225, -0.98));
  // Baby on a beanbag, a rug, a softbox, a shelf of props, a plant.
  const baby = at(babyOnBeanbag("#ffd6e6"), -0.55, 0.22, -0.95);
  g.add(baby);
  const sb = at(softbox(), 0.9, 0.22, -1.1);
  sb.rotation.y = Math.atan2(-0.55 - 0.9, -0.95 + 1.1); // face the baby
  g.add(sb);
  g.add(at(rbox(1.0, 0.06, 0.3, "#c9874f", 0.02), -2.0, 1.6, -1.2).rotateY(Math.PI / 2));
  g.add(at(ball(0.12, "#ffb3cf"), -1.98, 1.75, -1.4), at(ball(0.1, "#bfe3ff"), -1.98, 1.73, -1.05), at(rbox(0.16, 0.2, 0.16, "#ffd257", 0.03), -1.98, 1.73, -0.8));
  g.add(at(cyl(0.2, 0.15, 0.35, "#f26a4d", 16), -1.75, 0.4, 0.9), at(tree("round", seed + 2, 0.45), -1.75, 0.57, 0.9));
  // Mum watching, the photographer shooting.
  const mum = at(actor(LOOKS.mom, "stand", { seed: 1 }), -1.65, 0.22, -0.35);
  face(mum, [-0.55, -0.95]);
  g.add(mum);
  const ph = shooter(0.55, 0.65, [-0.55, -0.95], 2);
  ph.position.y = 0.22;
  g.add(ph);
  // Garden outside the studio.
  g.add(at(tree("blossom", seed + 5, 1.1), 2.9, 0, -2.2), at(tree("round", seed + 6, 0.9), -3.0, 0, -2.4));
  g.add(at(bush("#5dbb63", seed, 1.2), 3.2, 0, 0.6), at(bush("#76cc6b", seed + 1, 1), -3.1, 0, 1.4), at(flowers(40, 1.4, seed), 2.6, 0, 1.9), at(flowers(30, 1.2, seed + 3), -2.4, 0, 2.4));
  return { group: g, subject: [-0.2, 1.0, -0.6], photographer: ph };
}

// ------------------------------------------------------------- fall family session

export function fallPark(seed = 23) {
  const g = new THREE.Group();
  g.add(island(4.8, { top: "#c9b34f", soil: "#a8683d", rock: "#86685a", lip: "#b89e43" }, seed));
  const R = rng(seed);
  // A ring of autumn trees behind, leaves on the ground, pumpkins.
  [[-3.2, -2.2, 1.25], [-1.4, -3.4, 1.4], [0.8, -3.6, 1.2], [2.8, -2.6, 1.35], [3.7, -0.6, 1.05], [-3.9, 0.2, 1.0]].forEach(([x, z, s], i) => g.add(at(tree("autumn", seed + i, s), x, 0, z)));
  g.add(at(flowers(220, 4.2, seed, ["#ef6a2c", "#f59a2a", "#d9412b", "#f7c447"], { flat: true }), 0, -0.02, 0));
  g.add(at(pumpkin(1.1), 2.2, 0, 1.2), at(pumpkin(0.8), 2.6, 0, 1.6), at(pumpkin(0.9), -2.5, 0, 1.3));
  // The family on a picnic blanket, the kid jumping, the dog.
  g.add(at(blanket(1.9, 1.5, ["#e54b4b", "#fff4e6"], 8), -0.2, 0, -0.6));
  const mom = at(actor(LOOKS.mom, "sit", { seed: 3 }), -0.65, 0.04, -0.75);
  const dad = at(actor(LOOKS.dad, "sit", { seed: 4 }), 0.25, 0.04, -0.75);
  const kid = at(actor(LOOKS.kid, "jump", { seed: 5 }), -0.2, 0.04, -0.05);
  for (const p of [mom, dad, kid]) face(p, [0.4, 2.0]);
  const pup = at(dog("#d98c4a", 2), 0.9, 0, -0.1);
  pup.rotation.y = -0.9;
  g.add(mom, dad, kid, pup);
  const ph = shooter(0.6, 2.1, [-0.2, -0.5], 6);
  g.add(ph);
  g.add(at(fall({ count: 70, area: [8, 8], height: 5, seed, speed: 0.55 }), 0, 0, -0.5));
  return { group: g, subject: [-0.1, 0.8, -0.3], photographer: ph };
}

// ------------------------------------------------------------- lakeside wedding

export function lakeWedding(seed = 37) {
  const g = new THREE.Group();
  g.add(island(5.0, { top: "#86d36f", soil: "#b87a4b", rock: "#8a7266", lip: "#73c262" }, seed));
  // The lake behind, with a sand shore and a shimmer.
  const shore = mesh(new THREE.CircleGeometry(2.25, 48).rotateX(-Math.PI / 2), clay("#f3d9a4"), { cast: false });
  g.add(at(shore, 1.4, 0.005, -2.3));
  const water = mesh(new THREE.CircleGeometry(2.0, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#4fb3e8", roughness: 0.15, metalness: 0.1, emissive: "#2a7fb8", emissiveIntensity: 0.25 }), { cast: false });
  g.add(at(water, 1.4, 0.012, -2.3));
  const glints = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const s = glow("#fff2c9", 0.35, 0.6);
    const a = i * 0.8;
    s.position.set(1.4 + Math.cos(a) * 1.2, 0.06, -2.3 + Math.sin(a) * 1.1);
    s.userData.tick = (t) => { s.material.opacity = Math.max(0, Math.sin(t * 2.5 + i * 1.9)) * 0.7; };
    glints.add(s);
  }
  g.add(glints);
  // The flower arch, the couple under it.
  const arch = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(1.0, 0.055, 10, 40, Math.PI), clay("#ffffff"));
  arch.add(at(ring, 0, 1.6, 0));
  arch.add(at(cyl(0.055, 0.055, 1.6, "#ffffff", 10), -1.0, 0.8, 0), at(cyl(0.055, 0.055, 1.6, "#ffffff", 10), 1.0, 0.8, 0));
  const R = rng(seed);
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    if (i > 3 && i < 11 && i % 2) continue;
    arch.add(at(ball(0.11 + R() * 0.06, ["#ffb3cf", "#ffffff", "#ffd2a6", "#ff8fb1"][i % 4]), Math.cos(a) * 1.0, 1.6 + Math.sin(a) * 1.0, 0.04));
  }
  for (const x of [-1, 1]) for (let j = 0; j < 4; j++) arch.add(at(ball(0.1, ["#ffb3cf", "#9fdc8e", "#ffffff", "#ffd2a6"][j]), x * 1.0, 0.3 + j * 0.35, 0.05));
  g.add(at(arch, -0.4, 0, -1.2));
  const bride = at(actor(LOOKS.bride, "hold", { seed: 7 }), -0.75, 0, -1.15);
  const groom = at(actor(LOOKS.groom, "hold", { seed: 8 }), -0.05, 0, -1.15);
  face(bride, [-0.05, -1.15]);
  face(groom, [-0.75, -1.15]);
  g.add(bride, groom);
  // An aisle of petals between rows of chairs with guests.
  g.add(at(mesh(new THREE.PlaneGeometry(0.7, 3.0).rotateX(-Math.PI / 2), clay("#ffffff"), { cast: false }), -0.4, 0.01, 0.6));
  g.add(at(flowers(40, 1.2, seed, ["#ffb3cf", "#ff8fb1", "#ffffff"]), -0.4, 0, 0.6));
  const guests = [LOOKS.guestA, LOOKS.guestB, LOOKS.guestC, LOOKS.guestD, LOOKS.guestE, LOOKS.mom];
  let k = 0;
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) for (let c = 0; c < 2; c++) {
    const x = -0.4 + side * (0.75 + c * 0.55);
    const z = 0.3 + row * 0.75;
    g.add(at(chair("#ffffff"), x, 0, z).rotateY(Math.PI));
    if ((row + c + (side > 0 ? 1 : 0)) % 3 !== 2) {
      const gu = at(actor(guests[k++ % guests.length], "sit", { seed: 20 + k }), x, 0.0, z - 0.02);
      gu.rotation.y = Math.PI;
      g.add(gu);
    }
  }
  g.add(at(tree("blossom", seed + 1, 1.25), -3.3, 0, -1.8), at(tree("round", seed + 2, 1.1), 3.6, 0, 0.8), at(bush("#76cc6b", seed, 1.2), -3.4, 0, 1.6));
  const ph = shooter(-0.4, 2.5, [-0.4, -1.15], 9);
  g.add(ph);
  return { group: g, subject: [-0.4, 1.0, -0.6], photographer: ph };
}

// ------------------------------------------------------------- night party

export function nightParty(seed = 51) {
  const g = new THREE.Group();
  g.add(island(4.8, { top: "#4f9a5c", soil: "#8a5a3c", rock: "#6a5a5a", lip: "#438a50" }, seed));
  g.add(at(rbox(4.6, 0.16, 4.0, "#c98a54", 0.04), 0, 0.08, -0.3));
  // Poles and fairy lights zig-zagging over the deck, bunting along the back.
  const P = [[-2.1, -2.1], [2.1, -2.1], [2.1, 1.5], [-2.1, 1.5]];
  for (const [x, z] of P) g.add(at(pole(2.7), x, 0.16, z));
  g.add(stringLights([[-2.1, 2.85, -2.1], [2.1, 2.85, 1.5], [-2.1, 2.85, 1.5], [2.1, 2.85, -2.1], [-2.1, 2.85, -2.1]], { sag: 0.4, bulbs: 12, seed }));
  g.add(bunting([-2.1, 2.5, -2.1], [2.1, 2.5, -2.1]));
  // Tables, a cake, balloons.
  g.add(at(roundTable("#fff4f6", 0.55), 1.3, 0.16, -1.2), at(cake(), 1.3, 0.89, -1.2));
  g.add(at(roundTable("#e9f3ff", 0.45), -1.4, 0.16, -1.5));
  g.add(at(balloon("#ff6b8b", 1), 1.9, 0.16, -1.8), at(balloon("#ffd257", 2), 2.0, 0.16, -1.5), at(balloon("#6ec9ff", 3), 1.75, 0.16, -1.55), at(balloon("#b493ff", 4), -1.8, 0.16, -1.9));
  // People dancing.
  [[LOOKS.guestA, -0.6, -0.6], [LOOKS.guestB, 0.2, -0.9], [LOOKS.guestC, 0.4, -0.1], [LOOKS.guestD, -0.4, 0.2], [LOOKS.kid, -1.1, -0.1], [LOOKS.guestE, 1.0, -0.4]].forEach(([look, x, z], i) => {
    const a = at(actor(look, "dance", { seed: i * 1.7 }), x, 0.16, z);
    face(a, [0.2, 2.2]);
    a.rotation.y += (i % 2 ? 0.4 : -0.4);
    g.add(a);
  });
  g.add(at(fall({ count: 90, area: [4.5, 4], height: 3.4, seed, speed: 0.5, colors: ["#ff6b8b", "#ffd257", "#6ec9ff", "#b493ff", "#5dd39e", "#ffffff"], size: [0.07, 0.05], spin: 5 }), 0, 0.16, -0.4));
  g.add(at(sparkles(14, 9, 2.5, "#ffe9a8", seed), 0, 0, 0));
  // Warm light from the bulbs.
  const warm = new THREE.PointLight("#ffc47a", 9, 9, 1.6);
  g.add(at(warm, 0, 2.6, -0.3));
  const pink = new THREE.PointLight("#ff7ab8", 4, 7, 1.6);
  g.add(at(pink, -1.8, 1.5, 1.0));
  g.add(at(tree("pine", seed, 1.1), -3.4, 0, -2.0), at(tree("pine", seed + 1, 0.9), 3.5, 0, -1.6), at(bush("#3f8a4a", seed, 1.1), 3.3, 0, 1.8));
  const ph = shooter(0.2, 2.3, [0, -0.4], 12);
  ph.position.y = 0.16;
  g.add(ph);
  return { group: g, subject: [0, 1.2, -0.4], photographer: ph };
}

export const ISLANDS = { studio, fallPark, lakeWedding, nightParty };
