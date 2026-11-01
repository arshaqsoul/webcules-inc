// Pure helpers for the Film register (FILM.md): the timeline, voice-over and score placement,
// and the editorial camera (push, land, drift, whip) that frames.mjs bakes into a shot's frames.
// No I/O here, so every rule is unit-tested in film.test.mjs.

export const FPS = 30;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Shot start times and durations from frames.mjs counts, in clips.json order. Returns { shots: { name: { at, dur } }, end }. */
export function timeline(shots, counts) {
  const out = {};
  let t = 0;
  for (const s of shots) {
    const n = counts[s.name];
    if (!n) throw new Error(`no frames for shot "${s.name}": run hybrid/frames.mjs`);
    out[s.name] = { at: r3(t), dur: r3(n / FPS) };
    t += n / FPS;
  }
  return { shots: out, end: r3(t) };
}

/** Absolute time of an anchor { shot, at } (at may be negative: seconds back from the shot's end), or "end" for the end card. */
export function anchor(a, tl) {
  if (a === "end") return tl.end;
  if (a?.shot === "end") return r3(tl.end + (a.at ?? 0));
  const s = tl.shots[a.shot];
  if (!s) throw new Error(`unknown shot "${a.shot}" in an anchor`);
  const at = a.at ?? 0;
  return r3(s.at + (at < 0 ? s.dur + at : at));
}

/**
 * Voice-over lines placed on the timeline. A line is { shot, at, text, fit? }: it starts at the anchor and is
 * stretched or squeezed toward `fit` seconds, never beyond `range` (a voice sped past 1.2x sounds rushed,
 * slowed past 0.85x sounds drunk). Lines may not overlap; the caller learns about it before any audio is made.
 */
export function placeLines(lines, tl, total) {
  const placed = lines.map((l, i) => ({ i, text: l.text, start: anchor(l, tl), fit: l.fit ?? null }));
  for (const p of placed) if (p.start < 0 || p.start >= total) throw new Error(`voice-over line ${p.i} starts at ${p.start}s, outside the film (0-${total}s)`);
  for (let k = 1; k < placed.length; k++) {
    const a = placed[k - 1], b = placed[k];
    if (b.start <= a.start) throw new Error(`voice-over lines ${a.i} and ${b.i} are out of order`);
    if (a.fit && a.start + a.fit > b.start + 0.05) throw new Error(`voice-over line ${a.i} (fit ${a.fit}s) runs into line ${b.i}`);
  }
  return placed;
}

/** The tempo that brings a raw read of `raw` seconds to `fit` seconds, clamped to a natural-sounding range. */
export function fitTempo(raw, fit, range = [0.85, 1.2]) {
  if (!fit) return 1;
  return Math.min(range[1], Math.max(range[0], raw / fit));
}

/** Score sections ({ from, to, tags, ... } with anchors) resolved to absolute { start, end } spans that tile the film. */
export function sections(score, tl, total) {
  const out = score.map((c, i) => ({ ...c, i, start: c.from ? anchor(c.from, tl) : 0, end: c.to ? anchor(c.to, tl) : total }));
  for (const s of out) if (s.end <= s.start) throw new Error(`score cue ${s.i} ends before it starts`);
  out.sort((a, b) => a.start - b.start);
  for (let k = 1; k < out.length; k++) if (out[k].start > out[k - 1].end + 0.05) throw new Error(`score has a silent gap before cue ${out[k].i}`);
  return out;
}

/**
 * The editorial camera for one shot, as an ffmpeg zoompan filter over a 1080x1920 input of `dur` seconds.
 * cam: {
 *   drift: { zoom: [1, 1.06], at: [fx, fy] }      slow linear push across the whole shot
 *   land:  { zoom: 1.6, dur: 0.7, at: [fx, fy] }  the shot starts pushed in and settles (the far side of a dive)
 *   push:  { zoom: 4, from: 0.6, at: [fx, fy] }   dive into a point over the last `from` seconds (ease-in)
 *   whip:  "out" | "in"                            a fast tilt up off the end, or landing from one at the start
 * }
 * at = the focus point as fractions of the frame (the dive heads into it). Returns "" when there is no camera.
 */
export function camera(cam, dur) {
  if (!cam || !Object.keys(cam).length) return "";
  const t = `(in/${FPS})`;
  const z = ["1"];
  let fx = "0.5", fy = "0.5";
  if (cam.drift) {
    const [z0, z1] = cam.drift.zoom ?? [1, 1.06];
    z.push(`(${z0}+(${z1 - z0})*min(1,${t}/${dur}))`);
    [fx, fy] = (cam.drift.at ?? [0.5, 0.5]).map(String);
  }
  if (cam.land) {
    const d = cam.land.dur ?? 0.7;
    z.push(`(1+${(cam.land.zoom ?? 1.6) - 1}*pow(max(0,1-${t}/${d}),2))`);
    const [lx, ly] = cam.land.at ?? [0.5, 0.5];
    fx = `if(lt(${t},${d}),${lx},${fx})`;
    fy = `if(lt(${t},${d}),${ly},${fy})`;
  }
  if (cam.push) {
    const from = cam.push.from ?? 0.6, s0 = r3(dur - from);
    z.push(`(1+${(cam.push.zoom ?? 4) - 1}*pow(max(0,${t}-${s0})/${from},2))`);
    const [px, py] = cam.push.at ?? [0.5, 0.5];
    fx = `if(gt(${t},${s0}),${px},${fx})`;
    fy = `if(gt(${t},${s0}),${py},${fy})`;
  }
  if (cam.whip === "out") {
    const s0 = r3(dur - 0.25);
    z.push("1.3");
    fy = `if(gt(${t},${s0}),max(0.38,0.5-pow((${t}-${s0})/0.25,2)*0.12),${fy})`;
  }
  if (cam.whip === "in") {
    z.push("1.25");
    fy = `if(lt(${t},0.3),0.4+0.1*pow(${t}/0.3,0.5),${fy})`;
  }
  const zoom = z.length > 1 ? z.slice(1).join("*") : "1";
  const zp = `zoompan=z='${zoom}':x='iw*(${fx})-iw/zoom/2':y='ih*(${fy})-ih/zoom/2':d=1:s=1080x1920:fps=${FPS}`;
  // Upscale first so slow pushes do not step pixel by pixel; frames blend into motion blur on a whip.
  return `scale=1620:2880:flags=lanczos,${zp}${cam.whip ? ",tmix=frames=3" : ""}`;
}
