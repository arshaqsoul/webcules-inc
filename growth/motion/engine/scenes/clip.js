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
//   poster   { brand, kicker, headline: [lines], cta, out }   frame 0 drawn as the grid tile (overlays.js poster)
//   cardAt   local seconds the inbox card drops (default flash + 0.35)
//   lines    { lines, at, out, y, size }   a kinetic headline over the clip (the hook, the closing line)
//   lift     px to draw the clip higher, its floor stretched below (needs a static camera)

import { seg, kinetic } from "../runtime.js";
import { chip, inboxCard, poster } from "../overlays.js";

const brands = {};

export default {
  async init(ctx, scenes) {
    for (const s of scenes) {
      const b = s.props.poster?.brand;
      if (b && !brands[b]) brands[b] = await (await fetch(ctx.asset(`marketing/brands/${b}.json`))).json();
    }
  },

  render(t, dur, p, ctx) {
    const n = Math.min(p.count, 1 + Math.floor(t * (p.fps ?? 30) + 1e-6));
    const plate = ctx.asset(p.frames.replace("%04d", String(n).padStart(4, "0")));
    let f = "";
    if (p.flash != null) {
      const fk = seg(t, p.flash, p.flash + 0.45);
      if (t >= p.flash && fk < 1) f += `<rect width="1080" height="1920" fill="#ffffff" opacity="${((1 - fk) * 0.5).toFixed(3)}"/>`;
    }
    if (p.chip) f += chip(t, 0, dur, p.chip, p.index ?? 0);
    if (p.lines) f += kinetic(t, p.lines.at ?? 0.2, p.lines.lines, { y: p.lines.y ?? 520, size: p.lines.size ?? 100, fill: "#ffffff", accent: "#ffe27a", out: p.lines.out ?? Infinity });
    if (p.toast) f += inboxCard(t, p.cardAt ?? p.flash + 0.35, dur, ctx, p.logo, p.toast);
    if (p.poster) f += poster(t, ctx, brands[p.poster.brand], p.poster);
    return { plate: p.lift ? { src: plate, lift: p.lift } : plate, front: f };
  },

  cues(p, dur) {
    // A reel made of many clips sets padFor on the first one (the whole reel) and pad: false on the rest.
    const c = p.pad === false ? [] : [{ t: 0, kind: "pad", dur: p.padFor ?? dur, gain: 0.45, notes: [50, 57, 62, 66, 69] }];
    if (p.whoosh) c.push({ t: 0, kind: "whoosh", dur: Math.min(1.4, dur), gain: 0.4 });
    if (p.lines) p.lines.lines.join(" ").split(" ").forEach((_, i) => c.push({ t: (p.lines.at ?? 0.2) + i * 0.09, kind: "tick", gain: 0.45 }));
    if (p.flash != null) c.push({ t: p.flash, kind: "shutter", gain: 0.9 });
    if (p.toast) c.push({ t: p.cardAt ?? p.flash + 0.35, kind: "chime", gain: 0.5, note: 78 });
    return c;
  },
};
