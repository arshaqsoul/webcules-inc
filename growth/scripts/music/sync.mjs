// Beat sync planning. Pure functions: the reel's key moments in, a tempo and an alignment out.
//
//   1. keyEvents(edl)       the moments that should land on a beat (hook, every step change, the end card, lightly the clicks)
//   2. planGrid(events)     BEFORE generating: the BPM (and downbeat offset) whose beat grid fits those moments best
//   3. alignToBeats(...)    AFTER generating: the generator never hits the BPM exactly, so find the small time-stretch and
//                           trim that put the MEASURED beats on the moments. Never pads (the bed is generated longer).

/** Moments of the reel that should land on a beat. Weights say how much it matters when one is off. */
export function keyEvents(edl) {
  const ev = [];
  if (edl.hook) ev.push({ t: 0.06, w: 1.5, kind: "hook" });
  for (const c of edl.captions ?? []) ev.push({ t: c.start_ms / 1000, w: 1, kind: "step" });
  ev.push({ t: edl.endcard_start_ms / 1000, w: 2, kind: "end" });
  // clicks already have their own sound effect, so they only nudge the choice
  for (const h of edl.highlights ?? []) ev.push({ t: h.out_ms / 1000, w: 0.25, kind: "click" });
  return ev.sort((a, b) => a.t - b.t);
}

const EIGHTH_PENALTY = 1.35; // landing on an off-beat eighth is allowed but worth less than landing on the beat

/** Distance (seconds) from time t to the nearest beat or eighth of a grid with period p whose beat 0 is at `phase`. */
function gridDistance(t, p, phase) {
  const u = (t - phase) / p;
  const beat = Math.abs(u - Math.round(u)) * p;
  const eighth = Math.abs(u * 2 - Math.round(u * 2)) * (p / 2);
  return beat <= EIGHTH_PENALTY * eighth ? { d: beat, on: "beat" } : { d: eighth * EIGHTH_PENALTY, on: "eighth", raw: eighth };
}

const costOf = (events, p, phase) => events.reduce((s, e) => s + e.w * Math.min(gridDistance(e.t, p, phase).d, p / 2), 0);

/** Pick the BPM + phase whose grid fits the events best. Integer BPM, because that is what the generator is asked for. */
export function planGrid(events, { bpmMin = 88, bpmMax = 132, prior = 110 } = {}) {
  let best = null;
  for (let bpm = bpmMin; bpm <= bpmMax; bpm++) {
    const p = 60 / bpm;
    for (let off = 0; off < p; off += 0.004) {
      const c = costOf(events, p, off) + 0.002 * Math.abs(bpm - prior); // tiny pull toward a trailer-ish tempo
      if (!best || c < best.cost) best = { bpm, offset_s: off, cost: c };
    }
  }
  return best;
}

/**
 * After generation: given the measured tempo (bpm0) and first-beat phase (phase0, seconds into the generated audio),
 * find the time-stretch rate r (>1 = faster) and the start trim (seconds of the ORIGINAL audio to drop) so that the
 * stretched, trimmed beats land on the events. Final time of an original moment x is (x - trim) / r.
 */
export function alignToBeats(events, { bpm0, phase0, target_bpm }, { rateMin = 0.92, rateMax = 1.08 } = {}) {
  const p0 = 60 / bpm0;
  let best = null;
  for (let r = rateMin; r <= rateMax + 1e-9; r += 0.002) {
    const p = p0 / r;
    // trim: drop 0 .. 4 beats off the front (a bar), in 4 ms steps; trimming a whole bar keeps the arrangement intact
    for (let trim = 0; trim < 4 * p0; trim += 0.004) {
      const phase = (phase0 - trim) / r;
      // a pull toward the PLANNED tempo: without it a 6 percent speed-up that rescues one cut beats a natural tempo, and the track feels rushed
      const drift = target_bpm ? 2.5 * Math.abs((bpm0 * r) / target_bpm - 1) : 0;
      const c = costOf(events, p, phase) + 300 * Math.abs(r - 1) * 0.001 + drift + 0.00005 * trim;
      if (!best || c < best.cost) best = { rate: r, trim_s: trim, cost: c, phase_s: phase, period_s: p };
    }
  }
  const deviations = events.map((e) => {
    const g = gridDistance(e.t, best.period_s, best.phase_s);
    return { kind: e.kind, t_ms: Math.round(e.t * 1000), dev_ms: Math.round((g.on === "eighth" ? g.raw : g.d) * 1000), grid: g.on, w: e.w };
  });
  // the start of the final audio must still land the first beat soon after zero: report where beat 0 falls
  const bpm_final = (60 / best.period_s);
  return { ...best, bpm_final, target_bpm, deviations };
}

/** Share of the weighted, non-click moments that land within tolerance of a beat or eighth. */
export function alignmentScore(deviations, tolMs = 70) {
  const main = deviations.filter((d) => d.kind !== "click");
  if (!main.length) return { within: 0, total: 0, ratio: 0 };
  const w = main.reduce((s, d) => s + d.w, 0);
  const ok = main.filter((d) => d.dev_ms <= tolMs).reduce((s, d) => s + d.w, 0);
  return { within: main.filter((d) => d.dev_ms <= tolMs).length, total: main.length, ratio: ok / w, tol_ms: tolMs };
}
