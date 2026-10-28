// A miniature 3D world the camera travels through: floating islands, one per
// moment of the story, in a sky that moves through the day. After the Airbnb
// Experiences and Services films: a continuous journey, tilt-shift blur, real
// soft light, many environments, joyful people.
//
// props:
//   hook      { lines, at, out }                    opening headline over the wide shot
//   opening   { pos, look }                          the wide establishing camera
//   islands   [{ kind, pos, at, dur, chip, flash, toast: { title, sub }, cam: { dist, el, az0, az1 } }]
//   sky       [[t, preset], ...]                     presets: morning, afternoon, golden, twilight, night
//                                                    each has a painted backdrop in growth/motion/assets/sky/ (assets.mjs);
//                                                    without the file the preset's gradient is drawn instead
//   finale    { at, pos, look, lines }               the pull-back over every island
//   logo      repo path to the Snap mark (for the toasts)

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ISLANDS } from "../world/islands.js";
import { cloud, tickAll, rng, clay, loadSurfaces } from "../world/kit.js";
import { seg, ease, kinetic, clamp, lerp, mixHex } from "../runtime.js";
import { chip, inboxCard } from "../overlays.js";

const SKY = {
  morning: { top: "#8fc3ff", bottom: "#ffe1d2", sun: ["#fff1dc", 2.6, 48, -35], hemi: ["#cfe6ff", "#f5d2b8", 1.0], fogNear: 40, cloud: "#ffffff" },
  afternoon: { top: "#76b2ff", bottom: "#ffe7c2", sun: ["#fff4e0", 2.8, 55, 20], hemi: ["#d6eaff", "#f2d8a8", 1.05], fogNear: 40, cloud: "#ffffff" },
  golden: { top: "#ff9db5", bottom: "#ffc56f", sun: ["#ffb26b", 3.0, 16, 60], hemi: ["#ffc3c8", "#ffb27a", 0.9], fogNear: 34, cloud: "#ffe0d0" },
  twilight: { top: "#3d48b8", bottom: "#ff9ec4", sun: ["#ffd0e6", 1.9, 30, -40], hemi: ["#a9b4ff", "#c98ab8", 1.0], fogNear: 40, cloud: "#c7b8f0" },
  night: { top: "#1b2160", bottom: "#7a4fa6", sun: ["#9fb4ff", 0.75, 40, -60], hemi: ["#4a5aa8", "#3a2a55", 0.55], fogNear: 30, cloud: "#8f86c9" },
};

// Tilt-shift: blur grows away from a horizontal band, for the miniature look.
const TiltShift = {
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1080, 1920) }, dir: { value: new THREE.Vector2(1, 0) }, focus: { value: 0.5 }, band: { value: 0.16 }, amount: { value: 7 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform vec2 dir; uniform float focus; uniform float band; uniform float amount; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - focus);
      float k = smoothstep(band, band + 0.28, d) * amount;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      vec2 o1 = dir * k * 1.3846153846 / res;
      vec2 o2 = dir * k * 3.2307692308 / res;
      c += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
      c += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
      c += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
      c += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
      gl_FragColor = c;
    }`,
};

let G = null;

function skyAt(keys, t) {
  // Cross-fade between presets over 1.2 s around each key time.
  let a = SKY[keys[0][1]];
  let b = a;
  let k = 0;
  for (let i = 1; i < keys.length; i++) {
    if (t >= keys[i][0] - 0.6) { a = SKY[keys[i - 1][1]]; b = SKY[keys[i][1]]; k = ease.inOutCubic(seg(t, keys[i][0] - 0.6, keys[i][0] + 0.6)); }
  }
  const mix = (x, y) => mixHex(x, y, k);
  return {
    top: mix(a.top, b.top), bottom: mix(a.bottom, b.bottom), cloud: mix(a.cloud, b.cloud),
    sun: [mix(a.sun[0], b.sun[0]), lerp(a.sun[1], b.sun[1], k), lerp(a.sun[2], b.sun[2], k), lerp(a.sun[3], b.sun[3], k)],
    hemi: [mix(a.hemi[0], b.hemi[0]), mix(a.hemi[1], b.hemi[1]), lerp(a.hemi[2], b.hemi[2], k)],
    fogNear: lerp(a.fogNear, b.fogNear, k),
    night: (a === SKY.night ? 1 - k : 0) + (b === SKY.night ? k : 0) + 0.6 * ((a === SKY.twilight ? 1 - k : 0) + (b === SKY.twilight ? k : 0)),
    from: a.name, to: b.name, k,
  };
}

for (const [name, s] of Object.entries(SKY)) s.name = name;

const V = (a) => new THREE.Vector3(...a);
const SKY_W = 540;
const SKY_H = 960;
const SKY_OVER = 1.14; // the painting is drawn this much larger than the frame, for parallax room

/** Load the painted sky for each preset, with the colour of its lower band for the fog. */
async function loadSkies(ctx) {
  const art = {};
  await Promise.all(Object.keys(SKY).map(async (name) => {
    const img = new Image();
    img.src = ctx.asset(`growth/motion/assets/sky/${name}.jpg`);
    try { await img.decode(); } catch { return; }
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const g = c.getContext("2d");
    g.drawImage(img, 0, img.height * 0.55, img.width, img.height * 0.3, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const avg = [0, 1, 2].map((ch) => { let v = 0; for (let i = ch; i < d.length; i += 4) v += d[i]; return Math.round(v / 256); });
    art[name] = { img, fog: `#${avg.map((v) => v.toString(16).padStart(2, "0")).join("")}` };
  }));
  return art;
}

export default {
  usesGL: true,

  async init(ctx, scenes) {
    const p = scenes[0].props;
    const renderer = ctx.renderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1080 / 1920, 0.1, 400);

    // Sky: the painted backdrops (or a gradient), redrawn each frame into a canvas.
    const skyArt = await loadSkies(ctx);
    await loadSurfaces(ctx.asset);
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = SKY_W;
    skyCanvas.height = SKY_H;
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;
    scene.fog = new THREE.Fog("#ffe1d2", 40, 140);

    // Soft studio fill from every side (a photo-studio light box), so clay reads
    // like the Airbnb sets: bright, round, no black shadows.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const hemi = new THREE.HemisphereLight("#cfe6ff", "#f5d2b8", 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff1dc", 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    // The islands, each at its place along the journey.
    const islands = p.islands.map((spec, i) => {
      const built = ISLANDS[spec.kind](spec.seed ?? 11 + i * 13);
      built.group.position.set(...spec.pos);
      built.group.rotation.y = spec.rot ?? 0;
      scene.add(built.group);
      built.group.updateMatrixWorld(true);
      return { spec, ...built, subjectW: built.group.localToWorld(V(built.subject)) };
    });

    // Clouds drifting around and below the islands.
    const R = rng("clouds");
    const clouds = [];
    const cloudMat = clay("#ffffff", { rough: 1, emissive: "#ffffff", ei: 0.22 });
    const span = islands.map((s) => s.spec.pos);
    for (let i = 0; i < 26; i++) {
      const base = span[i % span.length];
      const c = cloud(i + 1, 0.8 + R() * 1.1);
      c.traverse((o) => { if (o.isMesh) o.material = cloudMat; });
      // Most clouds float below the islands; a few high ones stay well off to the side.
      const high = i % 4 === 0;
      const side = (R() < 0.5 ? -1 : 1) * (high ? 15 + R() * 10 : R() * 11);
      const pos = [base[0] + side, high ? base[1] + 5 + R() * 4 : base[1] - 4 - R() * 7, base[2] + (R() - 0.5) * 14];
      c.userData.home = pos;
      c.userData.speed = 0.25 + R() * 0.3;
      scene.add(c);
      clouds.push(c);
    }

    // Stars for the night.
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 500; i++) {
      const a = R() * Math.PI * 2;
      const e = 0.15 + R() * 1.2;
      sp.push(Math.cos(a) * Math.cos(e) * 180, Math.sin(e) * 180, Math.sin(a) * Math.cos(e) * 180 - 40);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    scene.add(stars);

    // Post: render, tilt-shift (two passes), tone map and output.
    const rt = new THREE.WebGLRenderTarget(1080, 1920, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(1);
    composer.setSize(1080, 1920);
    composer.addPass(new RenderPass(scene, camera));
    const tsH = new ShaderPass(TiltShift);
    const tsV = new ShaderPass(TiltShift);
    tsV.uniforms.dir.value.set(0, 1);
    composer.addPass(tsH);
    composer.addPass(tsV);
    composer.addPass(new OutputPass());

    G = { scene, camera, skyCanvas, skyTex, skyArt, hemi, sun, islands, clouds, cloudMat, stars, composer, tsH, tsV, renderer };
  },

  render(t, dur, p, ctx) {
    const { scene, camera, skyCanvas, skyTex, skyArt, hemi, sun, islands, clouds, cloudMat, stars, composer, tsH, tsV, renderer } = G;
    const S = skyAt(p.sky, t);

    // Fog, light (the sky itself is painted once the camera is placed).
    const painted = skyArt[S.from] && skyArt[S.to];
    scene.fog.color.set(painted ? mixHex(skyArt[S.from].fog, skyArt[S.to].fog, S.k) : S.bottom);
    // Fog starts beyond what the camera is looking at (set below), so wide shots stay clear.
    hemi.color.set(S.hemi[0]);
    hemi.groundColor.set(S.hemi[1]);
    hemi.intensity = S.hemi[2] * 0.6;
    scene.environmentIntensity = 0.55 * (1 - 0.75 * S.night);
    sun.color.set(S.sun[0]);
    sun.intensity = S.sun[1];
    cloudMat.color.set(S.cloud);
    cloudMat.emissive.set(S.cloud);
    stars.material.opacity = S.night * (painted ? 0.45 : 0.9);

    // Camera: a chain of shots with eased, arcing moves between them.
    const shots = [];
    shots.push({ s: 0, tr: 0, f: (tt) => ({ pos: V(p.opening.pos).add(V(p.opening.drift ?? [0, 0, 0]).multiplyScalar(tt)), look: V(p.opening.look) }) });
    islands.forEach((isl) => {
      const c = { dist: 16, el: 26, az0: -40, az1: -20, ...(isl.spec.cam ?? {}) };
      const s0 = isl.spec.at;
      shots.push({
        s: s0, tr: isl.spec.tr ?? 1.3, arc: isl.spec.arc ?? 8,
        f: (tt) => {
          const k = seg(tt, s0, s0 + isl.spec.dur);
          const az = THREE.MathUtils.degToRad(lerp(c.az0, c.az1, k) + (isl.spec.rot ?? 0) * 57.3);
          const el = THREE.MathUtils.degToRad(c.el);
          const d = c.dist * (1 - 0.06 * k);
          // Frame the photographer and the subject together, a little above their heads.
          const look = isl.subjectW.clone().lerp(isl.photographer.getWorldPosition(new THREE.Vector3()), 0.35);
          look.y = isl.subjectW.y + 0.1;
          return { pos: look.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d)), look };
        },
      });
    });
    if (p.finale) shots.push({ s: p.finale.at, tr: p.finale.tr ?? 1.8, arc: 2, f: (tt) => ({ pos: V(p.finale.pos).add(V(p.finale.drift ?? [0, 0, 0]).multiplyScalar(tt - p.finale.at)), look: V(p.finale.look) }) });
    let k = 0;
    for (let i = 0; i < shots.length; i++) if (t >= shots[i].s) k = i;
    const cur = shots[k];
    let pose = cur.f(t);
    if (k > 0 && t < cur.s + cur.tr) {
      const u = ease.inOutCubic(seg(t, cur.s, cur.s + cur.tr));
      const a = shots[k - 1].f(cur.s);
      const b = cur.f(cur.s + cur.tr);
      pose = { pos: a.pos.clone().lerp(b.pos, u), look: a.look.clone().lerp(b.look, u) };
      pose.pos.y += Math.sin(Math.PI * u) * cur.arc;
      // Dolly out along the view direction mid-move, so the camera clears the island
      // it is leaving instead of skimming its walls and trees.
      const pull = cur.pull ?? a.look.distanceTo(b.look) * 0.45;
      pose.pos.add(pose.pos.clone().sub(pose.look).normalize().multiplyScalar(Math.sin(Math.PI * u) * pull));
    }
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    camera.updateMatrixWorld();

    // Sky: the painting slides a little as the camera turns and tilts, so it reads as far away.
    const g2 = skyCanvas.getContext("2d");
    if (painted) {
      const dir = pose.look.clone().sub(pose.pos).normalize();
      const dw = SKY_W * SKY_OVER;
      const dh = SKY_H * SKY_OVER;
      const ox = -(dw - SKY_W) / 2 * (1 - Math.sin(Math.atan2(dir.x, dir.z)));
      const oy = -(dh - SKY_H) / 2 * (1 - clamp(Math.asin(dir.y) / 0.6, -1, 1));
      g2.globalAlpha = 1;
      g2.drawImage(skyArt[S.from].img, ox, oy, dw, dh);
      if (S.k > 0 && S.to !== S.from) {
        g2.globalAlpha = S.k;
        g2.drawImage(skyArt[S.to].img, ox, oy, dw, dh);
      }
      g2.globalAlpha = 1;
    } else {
      const grd = g2.createLinearGradient(0, 0, 0, SKY_H);
      grd.addColorStop(0, S.top);
      grd.addColorStop(1, S.bottom);
      g2.fillStyle = grd;
      g2.fillRect(0, 0, SKY_W, SKY_H);
    }
    skyTex.needsUpdate = true;

    // The sun follows the focus so its shadow map covers what we see.
    const el = THREE.MathUtils.degToRad(S.sun[2]);
    const az = THREE.MathUtils.degToRad(S.sun[3]);
    const dist = camera.position.distanceTo(pose.look);
    const half = clamp(dist * 0.45, 7, 40);
    scene.fog.near = Math.max(S.fogNear, dist * 1.1);
    scene.fog.far = scene.fog.near + 120;
    sun.target.position.copy(pose.look);
    sun.position.copy(pose.look).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(40));
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 90 });
    sun.shadow.camera.updateProjectionMatrix();

    // Everything that moves.
    tickAll(scene, t);
    clouds.forEach((c, i) => {
      const h = c.userData.home;
      c.position.set(h[0] + ((t * c.userData.speed + i * 3) % 30) - 15, h[1] + Math.sin(t * 0.3 + i) * 0.2, h[2]);
    });

    // Flashes: the camera fires, a burst of light, then the glow fades.
    let flashA = 0;
    islands.forEach((isl) => {
      const ft = isl.spec.at + (isl.spec.flash ?? 2.4);
      const fk = seg(t, ft, ft + 0.45);
      const fl = isl.photographer.userData.flash;
      const on = t >= ft && t <= ft + 0.45;
      fl.scale.setScalar(on ? 0.4 + 3.2 * ease.outCubic(fk) : 0.01);
      fl.material.opacity = on ? 1 - fk : 0;
      if (on) flashA = Math.max(flashA, (1 - fk) * 0.5);
    });

    // Render with miniature blur, stronger on the wide shots.
    renderer.setRenderTarget(null);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const wide = clamp((dist - 14) / 30);
    for (const pass of [tsH, tsV]) {
      pass.uniforms.focus.value = 0.47;
      pass.uniforms.band.value = lerp(0.17, 0.2, wide);
      pass.uniforms.amount.value = lerp(6, 5, wide);
    }
    composer.render();

    // Overlays: hook, time chips, flash, toasts, finale.
    let f = "";
    if (flashA > 0) f += `<rect width="1080" height="1920" fill="#ffffff" opacity="${flashA.toFixed(3)}"/>`;
    f += kinetic(t, p.hook.at, p.hook.lines, { y: 760, size: 104, fill: "#ffffff", accent: "#ffe27a", out: p.hook.out });
    if (t < p.hook.out + 0.3) f = `<rect width="1080" height="1920" fill="#2a1450" opacity="${(0.22 * (1 - seg(t, p.hook.out - 0.1, p.hook.out + 0.3))).toFixed(3)}"/>` + f;

    islands.forEach((isl, i) => {
      const s0 = isl.spec.at;
      const s1 = s0 + isl.spec.dur;
      f += chip(t, s0, s1, isl.spec.chip, i);
      // Toast from the Snap inbox, a beat after the flash.
      if (isl.spec.toast) f += inboxCard(t, s0 + (isl.spec.flash ?? 2.4) + 0.35, s1, ctx, p.logo, isl.spec.toast);
    });

    if (p.finale?.lines) f += kinetic(t, p.finale.at + 0.9, p.finale.lines, { y: 1340, size: 76, fill: "#ffffff", accent: "#ffe27a", stagger: 0.06, out: dur - 0.3, outDur: 0.3 });
    return { front: f, gl: true };
  },

  cues(p, dur) {
    const c = [{ t: 0, kind: "pad", dur, gain: 0.45, notes: [50, 57, 62, 66, 69] }, { t: p.islands[0].at, kind: "pulse", dur: dur - p.islands[0].at - 0.2, gain: 0.32, bpm: 96 }];
    p.hook.lines.join(" ").split(" ").forEach((_, i) => c.push({ t: p.hook.at + i * 0.09, kind: "tick", gain: 0.45 }));
    const notes = [74, 78, 81, 86];
    p.islands.forEach((isl, i) => {
      c.push({ t: isl.at, kind: "whoosh", dur: 1.1, gain: 0.35 });
      c.push({ t: isl.at + (isl.flash ?? 2.4), kind: "shutter", gain: 0.9 });
      if (isl.toast) c.push({ t: isl.at + (isl.flash ?? 2.4) + 0.35, kind: "chime", gain: 0.5, note: notes[i % notes.length] });
    });
    if (p.finale) c.push({ t: p.finale.at, kind: "whoosh", dur: 1.6, gain: 0.4 }, { t: p.finale.at + 0.9, kind: "bloom", gain: 0.6 });
    return c;
  },
};
