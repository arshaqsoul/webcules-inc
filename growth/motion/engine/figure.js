// A tiny photographer, the BUCK-style character that gives the diorama its
// scale and its feeling. Drawn flat in screen space at a projected world
// point, sized by the camera, so it stays crisp at every zoom.
//
// pose: { walk 0..1 (stride amount), phase (radians), slump 0..1, lift 0..1 (camera raised) }

const f = (n) => n.toFixed(1);

export const LOOK = {
  skin: "#e7b48e", hair: "#3a2820", top: "#5f7fa6", topShade: "#4c6a90", legs: "#2f2a33", shoe: "#1d191f",
  camera: "#2a2529", lens: "#8b95e8", strap: "#1d191f",
};

export function photographer(cam, [x, y, z], pose, look = LOOK) {
  const [sx, sy] = cam.p(x, y, z);
  const k = cam.s * 0.92; // one figure unit in px
  const { walk = 0, phase = 0, slump = 0, lift = 0 } = pose;
  const sw = Math.sin(phase) * walk;
  const bob = Math.abs(Math.cos(phase)) * walk * 1.6;
  const hipY = -30 - bob + slump * 3;
  const shoulderY = hipY - 24 + slump * 2;
  const headY = shoulderY - 11 + slump * 4;
  const lean = slump * 5;
  const g = (inner) => `<g transform="translate(${f(sx)} ${f(sy)}) scale(${f(k)})">${inner}</g>`;
  let s = "";
  // Contact shadow.
  s += `<ellipse cx="2" cy="0.5" rx="14" ry="4.5" fill="#14090f" opacity="0.35"/>`;
  // Legs: the far leg first, darker.
  const leg = (dx, ang, col) => `<g transform="translate(${f(dx)} ${f(hipY)}) rotate(${f(ang)})"><rect x="-3.4" y="0" width="6.8" height="29" rx="3.4" fill="${col}"/><rect x="-3.6" y="25" width="10" height="5" rx="2.5" fill="${look.shoe}"/></g>`;
  s += leg(-1, sw * 24, "#262129");
  // Back arm.
  const armBack = -sw * 26 + slump * 6;
  s += `<g transform="translate(${f(lean - 2)} ${f(shoulderY + 3)}) rotate(${f(armBack)})"><rect x="-3" y="0" width="6" height="22" rx="3" fill="${look.topShade}"/></g>`;
  // Torso.
  s += `<g transform="translate(${f(lean * 0.6)} 0) rotate(${f(lean * 1.2)} 0 ${f(hipY)})"><rect x="-10" y="${f(shoulderY)}" width="20" height="${f(hipY - shoulderY + 4)}" rx="8" fill="${look.top}"/>`;
  // The camera on its strap: hanging at the hip, or raised to the eye.
  const camX = 7 + lift * 4;
  const camY = hipY - 6 - lift * (hipY - headY - 8);
  s += `<path d="M-6 ${f(shoulderY + 2)}Q${f(camX - 4)} ${f((shoulderY + camY) / 2)} ${f(camX)} ${f(camY)}" stroke="${look.strap}" stroke-width="1.6" fill="none"/>`;
  s += `<rect x="${f(camX - 2)}" y="${f(camY - 5)}" width="14" height="10" rx="2.5" fill="${look.camera}"/>`;
  s += `<circle cx="${f(camX + 9)}" cy="${f(camY)}" r="4" fill="#111" stroke="${look.lens}" stroke-width="1.4"/>`;
  s += `<rect x="${f(camX)}" y="${f(camY - 7.5)}" width="5" height="3" rx="1" fill="${look.camera}"/>`;
  s += "</g>";
  // Near leg and near arm.
  s += leg(2, -sw * 24, look.legs);
  const armFront = sw * 26 - 8 + slump * 10 - lift * 70;
  s += `<g transform="translate(${f(lean + 3)} ${f(shoulderY + 3)}) rotate(${f(armFront)})"><rect x="-3.2" y="0" width="6.4" height="22" rx="3.2" fill="${look.top}"/><circle cx="0" cy="22" r="3.4" fill="${look.skin}"/></g>`;
  // Head: neck, face, hair with a fringe.
  const hx = lean * 1.6;
  s += `<rect x="${f(hx - 2.5)}" y="${f(headY + 6)}" width="5" height="6" fill="${look.skin}"/>`;
  s += `<circle cx="${f(hx + 1)}" cy="${f(headY)}" r="8.5" fill="${look.skin}"/>`;
  s += `<path d="M${f(hx - 8)} ${f(headY + 1)}Q${f(hx - 8)} ${f(headY - 11)} ${f(hx + 2)} ${f(headY - 10)}Q${f(hx + 10)} ${f(headY - 9)} ${f(hx + 9)} ${f(headY - 3)}Q${f(hx + 3)} ${f(headY - 7)} ${f(hx - 3)} ${f(headY - 4)}L${f(hx - 5)} ${f(headY + 5)}Z" fill="${look.hair}"/>`;
  s += `<circle cx="${f(hx + 5)}" cy="${f(headY + 0.5 + slump * 1.5)}" r="1.1" fill="#2a1d1a"/>`;
  return g(s);
}
