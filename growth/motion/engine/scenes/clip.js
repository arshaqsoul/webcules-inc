// A generated clip (Wan 2.2 in local ComfyUI, see growth/motion/hybrid/) played
// frame by frame under the code overlays: the time chip, the shutter flash and
// the Snap inbox card. The picture comes from the model; every word and every
// Snap moment stays code, so it is exact and identical on every render.
//
// props:
//   frames   repo path pattern of the clip's frames, "%04d" for the 1-based index (1080x1920 JPEGs at the reel fps)
//   count    number of frames; the last one holds if the scene runs longer
//   fps      the frames' rate (default 30)
//   chip     [time, what]
//   flash    local seconds the photographer's shutter fires
//   toast    { title, sub }   the Snap inbox card, a beat after the flash
//   logo     repo path to the Snap mark
//   index    colour slot for the chip dot

import { seg } from "../runtime.js";
import { chip, inboxCard } from "../overlays.js";

export default {
  render(t, dur, p, ctx) {
    const n = Math.min(p.count, 1 + Math.floor(t * (p.fps ?? 30) + 1e-6));
    const plate = ctx.asset(p.frames.replace("%04d", String(n).padStart(4, "0")));
    let f = "";
    if (p.flash != null) {
      const fk = seg(t, p.flash, p.flash + 0.45);
      if (t >= p.flash && fk < 1) f += `<rect width="1080" height="1920" fill="#ffffff" opacity="${((1 - fk) * 0.5).toFixed(3)}"/>`;
    }
    if (p.chip) f += chip(t, 0, dur, p.chip, p.index ?? 0);
    if (p.toast) f += inboxCard(t, p.flash + 0.35, dur, ctx, p.logo, p.toast);
    return { plate, front: f };
  },

  cues(p, dur) {
    const c = [{ t: 0, kind: "pad", dur, gain: 0.45, notes: [50, 57, 62, 66, 69] }];
    if (p.flash != null) c.push({ t: p.flash, kind: "shutter", gain: 0.9 });
    if (p.toast) c.push({ t: p.flash + 0.35, kind: "chime", gain: 0.5, note: 78 });
    return c;
  },
};
