// End card: the Snap mark as a spinning 3D coin (three.js), the offer, the URL.
//
// props:
//   logo     repo path to the Snap mark
//   name     "Snap"
//   lines    ["Booking · Contracts · Invoices · Galleries"]
//   offer    "*0%* commission. *Free* to start."
//   url      "snaphq.app"

import { W, seg, ease, text, kinetic } from "../runtime.js";

let G = null;

export default {
  usesGL: true,

  async init(ctx, scenes) {
    const THREE = ctx.three;
    const p = scenes[0].props;
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(1080, 1920, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1080 / 1920, 0.1, 100);
    camera.position.set(0, 0, 12);

    // Face texture: the mark on a lavender disc, so the round cap reads cleanly.
    const img = new Image();
    img.src = ctx.asset(p.logo);
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1024;
    const g = cv.getContext("2d");
    g.fillStyle = "#5e6ad2";
    g.beginPath(); g.arc(512, 512, 512, 0, Math.PI * 2); g.fill();
    g.drawImage(img, 40, 40, 944, 944);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const side = new THREE.MeshStandardMaterial({ color: 0x8b95e8, metalness: 0.55, roughness: 0.3 });
    const face = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.15, roughness: 0.45 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 128), [side, face, face]);
    coin.rotation.x = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.add(coin);
    scene.add(pivot);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 4, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9ceff, 2.5);
    rim.position.set(4, -2, -3);
    scene.add(rim);

    G = { THREE, renderer, scene, camera, pivot };
  },

  render(t, dur, p) {
    const inA = seg(t, 0, 0.3);
    let b = `<rect width="1080" height="1920" fill="#f1f1fb" opacity="${inA.toFixed(3)}"/>`;
    b += `<defs><radialGradient id="ctaGlow" cx="0.5" cy="0.36" r="0.55"><stop offset="0" stop-color="#8b95e8" stop-opacity="0.45"/><stop offset="1" stop-color="#8b95e8" stop-opacity="0"/></radialGradient></defs>`;
    b += `<rect width="1080" height="1920" fill="url(#ctaGlow)" opacity="${inA.toFixed(3)}"/>`;

    // The coin lands spinning and settles with a slow idle sway, so the end card never freezes.
    const spin = ease.outExpo(seg(t, 0, 1.6));
    const drop = ease.outBack(seg(t, 0, 0.7));
    G.pivot.rotation.y = (1 - spin) * Math.PI * 5 + Math.sin(t * 1.3) * 0.22 * spin;
    G.pivot.rotation.x = Math.sin(t * 0.9) * 0.08;
    G.pivot.position.y = 1.15 + (1 - drop) * 3;
    G.pivot.scale.setScalar(0.4 + 0.6 * drop);
    G.renderer.render(G.scene, G.camera);
    // Shadow under the coin.
    b += `<ellipse cx="${W / 2}" cy="930" rx="${(220 * drop).toFixed(1)}" ry="22" fill="#2b2f6b" opacity="${(0.14 * drop).toFixed(3)}" filter="url(#ctaBlur)"/>`;
    b += `<defs><filter id="ctaBlur"><feGaussianBlur stdDeviation="12"/></filter></defs>`;

    let f = "";
    const a1 = seg(t, 0.5, 0.8);
    f += text(W / 2, 1110 + (1 - ease.outCubic(a1)) * 30, p.name, { size: 120, weight: 800, fill: "#0f1011", opacity: a1, spacing: -3 });
    p.lines.forEach((l, i) => {
      const a = seg(t, 0.7 + i * 0.1, 1.0 + i * 0.1);
      f += text(W / 2, 1190 + i * 52, l, { size: 38, weight: 600, fill: "#4a4d63", opacity: a });
    });
    f += kinetic(t, 1.0, [p.offer], { y: 1310, size: 56, fill: "#0f1011", accent: "#5e6ad2", stagger: 0.05 });
    const bk = ease.outBack(seg(t, 1.4, 1.8));
    const pulse = 1 + 0.025 * Math.sin(Math.max(0, t - 1.8) * 4);
    f += `<g transform="translate(${W / 2} 1440) scale(${(bk * pulse).toFixed(3)})" opacity="${seg(t, 1.4, 1.6).toFixed(3)}">`;
    f += `<rect x="-230" y="-56" width="460" height="112" rx="56" fill="#232326"/>`;
    f += text(0, 18, p.url, { size: 50, weight: 800, fill: "#ffffff" });
    f += "</g>";
    return { back: b, front: f, gl: true };
  },

  cues(p) {
    return [
      { t: 0, kind: "whoosh", dur: 0.6, gain: 0.4 },
      { t: 0.55, kind: "hit", gain: 0.9 },
      { t: 0.6, kind: "shimmer", gain: 0.6 },
      { t: 1.45, kind: "pop", gain: 0.6 },
    ];
  },
};
