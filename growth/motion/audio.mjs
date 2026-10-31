// Score synthesiser: turns the scenes' cue list into a 48 kHz stereo WAV.
// No samples, no generated music: every sound is a few lines of DSP, so the
// score is exact to the frame and identical on every render.
//
// Cue: { t, kind, dur?, gain?, note?, accel? }. Kinds are the cases below;
// add a case to add a sound. "station:<kind>" cues come from the machine scene.

const SR = 48000;

function mulberry(seed) {
  let a = [...String(seed)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0), 7);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function synthesize(cues, duration, { seed = "reel", master = 0.8 } = {}) {
  const n = Math.ceil((duration + 0.05) * SR);
  const dry = [new Float32Array(n), new Float32Array(n)];
  const send = new Float32Array(n); // reverb send, mono
  const rand = mulberry(seed);
  const noise = () => rand() * 2 - 1;

  const put = (i, v, pan = 0, wet = 0) => {
    if (i < 0 || i >= n) return;
    dry[0][i] += v * Math.min(1, 1 - pan);
    dry[1][i] += v * Math.min(1, 1 + pan);
    send[i] += v * wet;
  };
  const at = (t) => Math.round(t * SR);

  // --- voices -------------------------------------------------------------
  const click = (t, g, f = 2400, pan = 0) => {
    const s = at(t);
    for (let i = 0; i < SR * 0.04; i++) {
      const e = Math.exp(-i / (SR * 0.006));
      put(s + i, g * e * (0.6 * Math.sin((2 * Math.PI * f * i) / SR) + 0.4 * noise()), pan, 0.1);
    }
  };
  const thud = (t, g, f0 = 95, f1 = 45, len = 0.25, pan = 0, wet = 0.15) => {
    const s = at(t);
    let ph = 0;
    for (let i = 0; i < SR * len; i++) {
      const k = i / (SR * len);
      const f = f1 + (f0 - f1) * Math.exp(-k * 6);
      ph += (2 * Math.PI * f) / SR;
      const e = Math.exp(-k * 5) * Math.min(1, i / 60);
      put(s + i, g * e * Math.sin(ph) + (i < SR * 0.01 ? g * 0.3 * noise() * (1 - i / (SR * 0.01)) : 0), pan, wet);
    }
  };
  const bell = (t, g, note, len = 1.6, pan = 0, wet = 0.45) => {
    const s = at(t);
    const f = midi(note);
    const parts = [[1, 1, 1], [2.0, 0.35, 1.6], [2.76, 0.18, 2.4], [5.4, 0.06, 4]];
    for (let i = 0; i < SR * len; i++) {
      const tt = i / SR;
      let v = 0;
      for (const [m, a, d] of parts) v += a * Math.sin(2 * Math.PI * f * m * tt) * Math.exp(-tt * d * 2.2);
      put(s + i, g * v * Math.min(1, i / 40) * 0.5, pan, wet);
    }
  };
  const tone = (t, g, f, len, { shape = "sine", pan = 0, wet = 0.1, attack = 0.005, release = 0.03, vib = 0 } = {}) => {
    const s = at(t);
    let ph = 0;
    for (let i = 0; i < SR * len; i++) {
      const tt = i / SR;
      ph += (2 * Math.PI * f * (1 + vib * Math.sin(2 * Math.PI * 5 * tt))) / SR;
      const x = shape === "square" ? Math.sign(Math.sin(ph)) * 0.5 : shape === "saw" ? ((ph / Math.PI) % 2) - 1 : Math.sin(ph);
      const e = Math.min(1, tt / attack) * Math.min(1, (len - tt) / release);
      put(s + i, g * x * e, pan, wet);
    }
  };
  const noiseSweep = (t, g, len, from, to, { pan = 0, wet = 0.2, shape = "hump" } = {}) => {
    // One-pole low-pass on white noise with a moving cutoff.
    const s = at(t);
    let y = 0;
    for (let i = 0; i < SR * len; i++) {
      const k = i / (SR * len);
      const fc = from * Math.pow(to / from, k);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      y += a * (noise() - y);
      const e = shape === "rise" ? Math.pow(k, 2) * Math.min(1, (1 - k) * 40) : shape === "fall" ? Math.pow(1 - k, 2) : Math.sin(Math.PI * k);
      put(s + i, g * y * e * 2.2, pan, wet);
    }
  };
  const chord = (t, g, notes, len, { attack = 0.4, wet = 0.6, shape = "saw" } = {}) => {
    // Detuned, low-passed saws: a warm pad.
    const s = at(t);
    const voices = notes.flatMap((nn) => [midi(nn) * 0.997, midi(nn) * 1.003]);
    const ph = voices.map(() => rand() * Math.PI * 2);
    let y = 0;
    for (let i = 0; i < SR * len; i++) {
      const tt = i / SR;
      let v = 0;
      voices.forEach((f, j) => {
        ph[j] += (2 * Math.PI * f) / SR;
        v += shape === "saw" ? ((ph[j] / Math.PI) % 2) - 1 : Math.sin(ph[j]);
      });
      v /= voices.length;
      y += 0.06 * (v - y);
      const e = Math.min(1, tt / attack) * Math.min(1, (len - tt) / Math.min(1.2, len * 0.5));
      put(s + i, g * y * e * 3, (rand() - 0.5) * 0.2, wet);
    }
  };

  // --- cues ---------------------------------------------------------------
  for (const c of cues) {
    const g = c.gain ?? 0.6;
    const t = c.t;
    const d = c.dur ?? 0.5;
    switch (c.kind) {
      case "tick": click(t, g * 0.35, 1800 + rand() * 600, (rand() - 0.5) * 0.4); break;
      case "drone": {
        const s = at(t);
        let ph1 = 0, ph2 = 0, ph3 = 0;
        for (let i = 0; i < SR * d; i++) {
          const tt = i / SR;
          ph1 += (2 * Math.PI * 55) / SR; ph2 += (2 * Math.PI * 55.4) / SR; ph3 += (2 * Math.PI * 82.6) / SR;
          const swell = Math.min(1, tt / 1.5) * (0.6 + 0.4 * (tt / d)) * Math.min(1, (d - tt) / 0.02);
          put(s + i, g * 0.22 * swell * (Math.sin(ph1) + Math.sin(ph2) + 0.5 * Math.sin(ph3)), 0, 0.05);
        }
        break;
      }
      case "clock": {
        let x = t;
        let k = 0;
        while (x < t + d) {
          click(x, g * 0.5, k % 2 ? 1300 : 1700, k % 2 ? -0.3 : 0.3);
          const p = (x - t) / d;
          x += c.accel ? 0.5 - 0.34 * p : 0.5;
          k++;
        }
        break;
      }
      case "clunk": thud(t, g, 110, 48, 0.3); click(t, g * 0.4, 900); break;
      case "station:inbox": for (let j = 0; j < 3; j++) { tone(t + j * 0.22, g * 0.22, 1318.5, 0.09, { wet: 0.25, pan: 0.3 }); tone(t + j * 0.22 + 0.07, g * 0.22, 1760, 0.12, { wet: 0.25, pan: 0.3 }); } break;
      case "station:calendar": for (let j = 0; j < 5; j++) noiseSweep(t + j * d / 5, g * 0.5, 0.09, 6000, 1500, { pan: -0.3, shape: "fall" }); break;
      case "station:contract": for (let j = 0; j < 3; j++) { const tt = t + (j + 0.5) * d / 3; thud(tt, g * 0.9, 160, 70, 0.18, 0.2, 0.2); click(tt, g * 0.4, 600, 0.2); } break;
      case "station:invoice": tone(t, g * 0.12, 118, d * 0.9, { shape: "square", vib: 0.03, pan: -0.2 }); for (let j = 0; j < 7; j++) click(t + j * d / 7, g * 0.25, 3000, 0.4); break;
      case "station:payment": for (let j = 0; j < 2; j++) tone(t + 0.15 + j * 0.28, g * 0.22, 175, 0.18, { shape: "square", pan: 0.2 }); break;
      case "station:gallery": for (let j = 0; j < 6; j++) tone(t + j * d / 6, g * 0.15, midi(72 + j * 2), 0.08, { wet: 0.3, pan: -0.3 + j * 0.1 }); break;
      case "station:phone": for (let j = 0; j < 2; j++) { const tt = t + j * 0.5; tone(tt, g * 0.13, 440, 0.38, { pan: 0.25, wet: 0.2, vib: 0.0 }); tone(tt, g * 0.13, 480, 0.38, { pan: 0.25, wet: 0.2 }); } break;
      case "station:reminders": for (let j = 0; j < 5; j++) { const tt = t + (j + 0.3) * d / 5.5; click(tt, g * 0.5, 700, -0.2); tone(tt + 0.01, g * 0.12, midi(76 + j * 2), 0.07, { wet: 0.3, pan: -0.2 }); } break;
      case "shutter": click(t, g * 0.9, 3200, 0.1); noiseSweep(t + 0.005, g * 0.5, 0.05, 9000, 3000, { shape: "fall", wet: 0.05 }); click(t + 0.07, g * 0.7, 2400, 0.1); noiseSweep(t + 0.03, g * 0.25, 0.35, 6000, 800, { shape: "fall", wet: 0.4 }); break;
      case "whoosh": noiseSweep(t, g, d, 400, 5000, { wet: 0.1 }); break;
      case "riser": {
        noiseSweep(t, g * 0.7, d, 300, 9000, { shape: "rise", wet: 0.3 });
        const s = at(t);
        let ph = 0;
        for (let i = 0; i < SR * d; i++) {
          const k = i / (SR * d);
          ph += (2 * Math.PI * (180 * Math.pow(6, k))) / SR;
          put(s + i, g * 0.12 * k * k * Math.sin(ph) * Math.min(1, (1 - k) * 60), 0, 0.2);
        }
        break;
      }
      case "alarm": for (let x = t; x < t + d; x += 0.25) tone(x, g * 0.1, (Math.round((x - t) / 0.25) % 2) ? 660 : 880, 0.22, { shape: "square", wet: 0.2 }); break;
      case "boom": thud(t, g, 70, 32, 1.8, 0, 0.5); noiseSweep(t, g * 0.8, 0.5, 3000, 120, { shape: "fall", wet: 0.6 }); break;
      case "suck": noiseSweep(t, g, d, 200, 7000, { shape: "rise", wet: 0.3 }); break;
      case "bloom": chord(t, g * 0.5, [48, 55, 64, 71, 74], 2.6, { attack: 0.08, wet: 0.7 }); bell(t, g * 0.4, 84, 2, 0, 0.6); break;
      case "pad": chord(t, g * 0.35, c.notes ?? [48, 55, 64, 67, 71], d, { attack: 0.6, wet: 0.7 }); break;
      case "pulse": for (let x = t; x < t + d - 0.05; x += 60 / (c.bpm ?? 100)) thud(x, g * 0.55, 80, 42, 0.22, 0, 0.05); break;
      case "chime": bell(t, g, c.note ?? 79, 1.6, (rand() - 0.5) * 0.4); break;
      case "pop": tone(t, g * 0.25, 880, 0.06, { wet: 0.2 }); tone(t + 0.03, g * 0.2, 1320, 0.08, { wet: 0.2 }); break;
      case "hit": chord(t, g * 0.55, [36, 48, 55, 64, 67, 71, 74], 3.2, { attack: 0.01, wet: 0.7 }); thud(t, g * 0.9, 90, 38, 1.2, 0, 0.3); bell(t, g * 0.35, 86, 2.5, 0.2, 0.7); break;
      case "shimmer": for (let j = 0; j < 8; j++) bell(t + j * 0.07, g * 0.12, [84, 88, 91, 95][j % 4], 1.2, (j % 2 ? -0.5 : 0.5), 0.8); break;
      default: throw new Error(`audio: no voice for cue kind "${c.kind}"`);
    }
  }

  // --- reverb (Schroeder: 4 combs into 2 all-passes) on the send ----------
  const wet = new Float32Array(n);
  const combs = [1557, 1617, 1491, 1422].map((l) => ({ buf: new Float32Array(Math.round(l * SR / 44100)), i: 0 }));
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.buf[c.i] = send[i] + y * 0.84;
      c.i = (c.i + 1) % c.buf.length;
      v += y;
    }
    wet[i] = v * 0.25;
  }
  for (const l of [225, 556]) {
    const buf = new Float32Array(Math.round(l * SR / 44100));
    let j = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[j];
      const x = wet[i];
      buf[j] = x + y * 0.5;
      wet[i] = y - x * 0.5;
      j = (j + 1) % buf.length;
    }
  }

  // --- mix, soft-clip, write 16-bit WAV -----------------------------------
  const out = Buffer.alloc(44 + n * 4);
  out.write("RIFF", 0); out.writeUInt32LE(36 + n * 4, 4); out.write("WAVE", 8);
  out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
  out.write("data", 36); out.writeUInt32LE(n * 4, 40);
  const fadeOut = SR * 0.25;
  for (let i = 0; i < n; i++) {
    const tail = Math.min(1, (n - i) / fadeOut);
    for (let ch = 0; ch < 2; ch++) {
      const w = wet[Math.max(0, i - (ch ? 211 : 0))];
      const v = Math.tanh((dry[ch][i] + w * 0.6) * master) * tail;
      out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), 44 + i * 4 + ch * 2);
    }
  }
  return out;
}
