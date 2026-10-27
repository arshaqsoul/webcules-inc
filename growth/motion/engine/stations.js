// The station library for the "machine" scene.
// Each station is one chore a photographer does by hand, built as a small
// isometric device on its own base plate. A new episode reuses these or adds
// one: write draw(cam, T, x0, s) and register it in STATIONS.
//
// Station-local layout (world units): base plate x0..x0+200, y 0..124, z 0..8.
// The device stands in y 6..60, the shared belt runs in y 66..104.
// s = { k, active, visited, t, alarm, n, rng }
//   k       processing progress while the client card sits here (0..1)
//   active  1 while the card is here, eased in and out
//   visited 1 once the card has been here (the lamp stays red: unresolved)
//   t       global time in seconds, for idle motion
//   alarm   0..1, the "everything is pending" pulse after the reveal

import { box, cylinder, line, screws, inlay, faceText } from "./iso.js";
import { clamp, ease } from "./runtime.js";

export const PLATE = { w: 200, d: 124, h: 8 };

function plate(cam, T, x0, label) {
  let s = "";
  // Feet under the corners, a halo, the plate, its groove and corner screws.
  for (const [fx, fy] of [[14, 12], [186, 12], [14, 112], [186, 112]]) s += cylinder(cam, T, x0 + fx, fy, 5, -8, 8, { tone: "woodDark" });
  s += box(cam, T, x0, 0, 0, PLATE.w, PLATE.d, PLATE.h, { tone: "wood", halo: true, bevel: 1.2 });
  s += line(cam, T, [[x0 + 6, 62, 8], [x0 + 194, 62, 8]], { tone: "lo", width: 0.7 });
  s += screws(cam, T, [[x0 + 7, 6, 8], [x0 + 193, 6, 8], [x0 + 7, 118, 8], [x0 + 193, 118, 8]]);
  // The one engraved label: the "app" this station stands for.
  s += faceText(cam, "front", [x0 + 8, PLATE.d, 8], label, { size: 5.6, dy: 6.2, fill: T.mat ? "#4a2e1c" : T.mid, weight: 800, spacing: 0.6 });
  return s;
}

function lamp(cam, T, x, y, z, st) {
  const blink = st.visited ? (0.5 + 0.5 * Math.sin(st.t * 9 + x * 0.05)) : 0;
  const on = st.visited && blink > 0.35;
  let s = cylinder(cam, T, x, y, 4.2, z, 3);
  s += cylinder(cam, T, x, y, 3, z + 3, 5, { tone: on ? "red" : "base" });
  if (on) {
    const [cx, cy] = cam.p(x, y, z + 8);
    s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(7 * cam.s).toFixed(1)}" fill="${T.red}" opacity="${(0.35 * blink).toFixed(2)}" filter="url(#glow)"/>`;
  }
  return s;
}

function screenRect(cam, x0, x1, y, z0, z1, fill, opts) {
  return inlay(cam, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill, opts);
}

const inbox = {
  label: "01 EMAIL",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    // Letters stacked on a shelf: the pile grows as replies come in.
    const pile = 3 + Math.floor(st.n * 0.4);
    s += box(cam, T, x0 + 128, 14, 8, 50, 40, 4, { tone: "woodDark" });
    for (let j = 0; j < pile; j++) s += box(cam, T, x0 + 132 + (j % 2) * 2, 18 + (j % 3), 12 + j * 3, 40, 30, 3, { tone: "paper" });
    // The mailbox body, its lid, slot and a screen counting unread mail.
    s += box(cam, T, x0 + 34, 10, 8, 74, 46, 54, { tone: "terra", bevel: 1.4 });
    s += box(cam, T, x0 + 30, 7, 62, 82, 52, 6, { tone: "terra", bevel: 1 });
    s += screenRect(cam, x0 + 48, x0 + 94, 56, 50, 55, "#050506");
    s += screenRect(cam, x0 + 44, x0 + 98, 56, 16, 42, "#07070a", { stroke: T.lo, width: 1 });
    s += faceText(cam, "front", [x0 + 49, 56, 40], "INBOX", { size: 5, dy: 6, fill: T.mid });
    s += faceText(cam, "front", [x0 + 49, 56, 32], `${st.n} unread`, { size: 8, dy: 9, fill: T.red, weight: 800 });
    // Letters fly out of the slot while the card is here.
    for (let j = 0; j < 5; j++) {
      const ph = (st.t * 1.4 + j / 5) % 1;
      const a = st.active * (1 - ph);
      s += box(cam, T, x0 + 54 + j * 7, 50, 62 + ph * 70, 20, 2, 13, { tone: "paper", opacity: a });
    }
    s += lamp(cam, T, x0 + 102, 18, 68, st);
    return { back: s };
  },
};

const calendar = {
  label: "02 SCHEDULER",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    s += box(cam, T, x0 + 30, 14, 8, 124, 42, 10, { tone: "woodDark", bevel: 1.2 });
    s += box(cam, T, x0 + 40, 18, 18, 104, 8, 66, { tone: "sage", bevel: 1 });
    // The page, flipping through dates while the card waits for an answer.
    const flips = st.k * 5;
    const day = 12 + Math.floor(flips);
    const ph = flips % 1;
    s += screenRect(cam, x0 + 46, x0 + 138, 26, 22, 78, T.paper);
    s += faceText(cam, "front", [x0 + 92, 26, 76], "JUNE", { size: 7, dy: 8, fill: "#e5484d", anchor: "middle", weight: 800, spacing: 1 });
    s += faceText(cam, "front", [x0 + 92, 26, 64], st.k >= 1 ? "?" : String(day), { size: 30, dy: 30, fill: "#18181a", anchor: "middle", weight: 800 });
    if (st.active > 0.05 && st.k < 1) {
      const zTop = 78 - ph * 56;
      s += screenRect(cam, x0 + 46, x0 + 138, 27, zTop - 6, zTop, "#e4e4df", { opacity: 1 - ph });
    }
    for (const rx of [62, 92, 122]) s += cylinder(cam, T, x0 + rx, 22, 3, 80, 8, { tone: "brass" });
    s += lamp(cam, T, x0 + 160, 30, 18, st);
    return { back: s };
  },
};

const contract = {
  label: "03 CONTRACT",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    // Printer at the back: the contract comes out to be printed, signed, scanned.
    s += box(cam, T, x0 + 16, 10, 8, 76, 44, 32, { bevel: 1.2 });
    s += box(cam, T, x0 + 22, 14, 40, 64, 30, 3, { tone: "charcoal" });
    const sheet = clamp(st.k * 1.6) * 40;
    if (sheet > 0.5) {
      s += box(cam, T, x0 + 30, 26, 43, 48, 2, sheet, { tone: "paper" });
      for (let r = 0; r < 4; r++) if (sheet > 10 + r * 7) s += line(cam, T, [[x0 + 34, 28, 43 + sheet - 8 - r * 7], [x0 + 70 - r * 6, 28, 43 + sheet - 8 - r * 7]], { tone: "#9a9aa0", width: 0.6 });
    }
    s += lamp(cam, T, x0 + 78, 18, 43, st);
    // Back post of the press, behind the belt.
    s += cylinder(cam, T, x0 + 138, 58, 4, 8, 92, { tone: "brass" });
    return {
      back: s,
      front: (() => {
        // Stamp and crossbar: three strokes while the card is under them.
        const hit = st.active > 0.05 ? Math.max(0, Math.sin(clamp(st.k) * Math.PI * 3)) : 0;
        const zStamp = 64 - hit * 38;
        let f = line(cam, T, [[x0 + 140, 86, 96], [x0 + 140, 86, zStamp + 14]], { tone: "hi", width: 1.4 });
        f += box(cam, T, x0 + 128, 76, zStamp, 24, 20, 14, { tone: "red", bevel: 0.8 });
        f += box(cam, T, x0 + 126, 52, 96, 28, 66, 9, { tone: "sage", bevel: 1 });
        f += cylinder(cam, T, x0 + 138, 114, 4, 8, 88, { tone: "brass" });
        return f;
      })(),
    };
  },
};

const invoice = {
  label: "04 INVOICE",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    s += box(cam, T, x0 + 30, 12, 8, 66, 46, 36, { tone: "charcoal", bevel: 1.4 });
    s += box(cam, T, x0 + 40, 26, 44, 46, 6, 2, { tone: "woodDark" });
    // Receipt paper pushes up out of the slot.
    const strip = 6 + clamp(st.k) * 52 + (st.visited && !st.active ? 52 : 0) * 0;
    s += box(cam, T, x0 + 44, 29, 46, 38, 2, strip, { tone: "paper" });
    if (strip > 16) s += faceText(cam, "front", [x0 + 63, 31, 46 + strip - 3], "INV-0042", { size: 5, dy: 5, anchor: "middle", fill: "#18181a", weight: 800 });
    for (let r = 0; r < 5; r++) if (strip > 22 + r * 7) s += line(cam, T, [[x0 + 48, 31, 46 + strip - 12 - r * 7], [x0 + 76 - (r % 2) * 10, 31, 46 + strip - 12 - r * 7]], { tone: "#9a9aa0", width: 0.6 });
    // A calculator console: keys tap while the invoice is being made.
    s += box(cam, T, x0 + 112, 12, 8, 64, 44, 10, { tone: "sage", bevel: 1 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const seed = (r * 4 + c) * 1.37;
        const down = st.active > 0.05 && Math.sin(st.t * 14 + seed * 5) > 0.75 ? 1.5 : 0;
        s += box(cam, T, x0 + 117 + c * 14, 16 + r * 13, 18 - down, 10, 9, 3, { tone: r === 2 && c === 3 ? "lit" : "cream" });
      }
    }
    s += lamp(cam, T, x0 + 90, 18, 44, st);
    return { back: s };
  },
};

const payment = {
  label: "05 PAYMENTS",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    // Card terminal with a screen that never stops saying PENDING.
    s += box(cam, T, x0 + 36, 14, 8, 64, 44, 12, { tone: "charcoal", bevel: 1.2 });
    s += box(cam, T, x0 + 42, 18, 20, 52, 30, 46, { tone: "charcoal", bevel: 1.2 });
    s += screenRect(cam, x0 + 47, x0 + 89, 48, 38, 60, "#07070a", { stroke: T.lo, width: 1 });
    const blink = 0.55 + 0.45 * Math.sin(st.t * 7);
    s += faceText(cam, "front", [x0 + 68, 48, 56], "PENDING", { size: 6.2, dy: 7, anchor: "middle", fill: T.red, weight: 800, opacity: st.visited || st.active ? blink : 0.25 });
    s += faceText(cam, "front", [x0 + 68, 48, 47], "deposit", { size: 4.4, dy: 5, anchor: "middle", fill: T.mid });
    for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) s += box(cam, T, x0 + 48 + c * 13, 50 + r * 0, 22 + r * 7, 9, 2, 5, { tone: "cream" });
    // Reminder slips pile up beside it: "just following up".
    const slips = Math.floor(clamp(st.k) * 6) + (st.visited ? 0 : 0);
    s += box(cam, T, x0 + 122, 16, 8, 52, 38, 3, { tone: "woodDark" });
    for (let j = 0; j < slips; j++) s += box(cam, T, x0 + 126 + (j % 2) * 3, 20 - (j % 2), 11 + j * 3.2, 42, 28, 3, { tone: "paper" });
    if (slips > 0) s += faceText(cam, "front", [x0 + 128, 48 - (slips % 2), 11 + slips * 3.2 + 2], "REMINDER", { size: 4, dy: 4.4, fill: "#e5484d", weight: 800 });
    s += lamp(cam, T, x0 + 104, 22, 20, st);
    return { back: s };
  },
};

const gallery = {
  label: "06 GALLERY",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    // External drive with a cable to the monitor.
    s += box(cam, T, x0 + 156, 20, 8, 28, 32, 14, { tone: "terra", bevel: 1 });
    s += line(cam, T, [[x0 + 156, 36, 14], [x0 + 140, 36, 10], [x0 + 128, 32, 10]], { tone: "lo", width: 1.4 });
    // Monitor: foot, neck, panel and a screen of photos uploading.
    s += box(cam, T, x0 + 72, 16, 8, 44, 30, 4, { tone: "charcoal", bevel: 0.8 });
    s += cylinder(cam, T, x0 + 94, 28, 4, 12, 22, { tone: "brass" });
    s += box(cam, T, x0 + 26, 26, 30, 132, 8, 76, { tone: "charcoal", bevel: 1.2 });
    s += screenRect(cam, x0 + 32, x0 + 152, 34, 36, 100, "#07070a");
    const tiles = ["#c9b8a6", "#8f9bb3", "#d8c3b0", "#a7b59c", "#b8a7c9", "#e0cdbd"];
    tiles.forEach((col, j) => {
      const c = j % 3;
      const r = Math.floor(j / 3);
      const shown = clamp(st.k * 7 - j) * (st.active > 0.05 || st.visited ? 1 : 0.35);
      const x = x0 + 38 + c * 38;
      const z = 92 - r * 26;
      s += screenRect(cam, x, x + 34, 34, z - 22, z, col, { opacity: 0.25 + 0.75 * shown });
    });
    // Upload bar and the file name everyone has seen.
    s += screenRect(cam, x0 + 38, x0 + 146, 34, 40, 43, T.lo);
    s += screenRect(cam, x0 + 38, x0 + 38 + 108 * clamp(st.k * 1.1), 34, 40, 43, T.lit);
    s += faceText(cam, "front", [x0 + 152, 34, 105.5], "gallery_FINAL_v3", { size: 4.6, dy: 4.6, anchor: "end", fill: T.mid });
    s += lamp(cam, T, x0 + 170, 36, 22, st);
    return { back: s };
  },
};

const phone = {
  label: "PHONE",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    // A side table with a desk phone that rings out, and a notepad of tally marks.
    s += box(cam, T, x0 + 26, 12, 8, 92, 48, 18, { tone: "woodDark", bevel: 1.2 });
    s += box(cam, T, x0 + 40, 20, 26, 54, 34, 12, { tone: "terra", bevel: 1 });
    s += inlay(cam, [[x0 + 46, 54, 30], [x0 + 88, 54, 30], [x0 + 88, 54, 36], [x0 + 46, 54, 36]], "#1b1426");
    const calls = Math.floor(clamp(st.k) * 4);
    s += faceText(cam, "front", [x0 + 67, 54, 36], st.active > 0.05 ? (Math.sin(st.t * 6) > 0 ? "CALLING..." : "NO ANSWER") : "MISSED", { size: 4.4, dy: 5, anchor: "middle", fill: st.active > 0.05 ? "#ffd257" : T.red, weight: 800 });
    // The handset jumps on its cradle while it rings.
    const ring = st.active > 0.05 ? Math.max(0, Math.sin(st.t * 30)) * 2.2 : 0;
    s += box(cam, T, x0 + 42, 24, 38 + ring, 50, 12, 6, { tone: "terra", bevel: 0.8 });
    s += cylinder(cam, T, x0 + 48, 30, 5, 38 + ring, 7, { tone: "terra" });
    s += cylinder(cam, T, x0 + 86, 30, 5, 38 + ring, 7, { tone: "terra" });
    if (st.active > 0.05) {
      const [cx, cy] = cam.p(x0 + 67, 30, 58);
      for (let i = 0; i < 3; i++) {
        const ph = (st.t * 2 + i / 3) % 1;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(8 + ph * 26) * cam.s / 1.6}" fill="none" stroke="${T.mat ? "#ffffff" : T.hi}" stroke-width="${(2.2 * cam.s / 1.6).toFixed(2)}" opacity="${((1 - ph) * 0.8 * st.active).toFixed(3)}"/>`;
      }
    }
    // Notepad: a tally mark for every unanswered call.
    s += box(cam, T, x0 + 128, 18, 8, 44, 36, 3, { tone: "paper" });
    for (let i = 0; i < calls + (st.visited ? 4 : 0) && i < 8; i++) s += line(cam, T, [[x0 + 134 + i * 4.5, 26, 11], [x0 + 134 + i * 4.5, 46, 11]], { tone: "#3a4b8c", width: 0.9 });
    s += lamp(cam, T, x0 + 112, 20, 26, st);
    return { back: s };
  },
};

const reminders = {
  label: "REMINDERS",
  draw(cam, T, x0, st) {
    let s = plate(cam, T, x0, st.label ?? this.label);
    // A cork board on legs: a sticky note goes up for every follow-up.
    s += box(cam, T, x0 + 34, 22, 8, 6, 6, 70, { tone: "woodDark" });
    s += box(cam, T, x0 + 150, 22, 8, 6, 6, 70, { tone: "woodDark" });
    s += box(cam, T, x0 + 28, 26, 26, 136, 6, 62, { tone: "wood", bevel: 1 });
    s += inlay(cam, [[x0 + 33, 32, 30], [x0 + 159, 32, 30], [x0 + 159, 32, 84], [x0 + 33, 32, 84]], T.mat ? "#e4b77d" : T.lo);
    const notes = [["DAY 3", "#ffd257"], ["DAY 7", "#ffa9c9"], ["DAY 10", "#8cc4ff"], ["DAY 14", "#8fdc86"], ["FINAL!", "#ff8f6e"]];
    const shown = st.visited ? notes.length : Math.floor(clamp(st.k) * (notes.length + 0.5));
    notes.forEach(([label, col], i) => {
      if (i >= shown) return;
      const pop = clamp((st.k * (notes.length + 0.5) - i) * 3);
      const nx = x0 + 38 + (i % 3) * 40 + (i > 2 ? 20 : 0);
      const nz = 80 - Math.floor(i / 3) * 26 - (1 - (st.visited ? 1 : pop)) * 6;
      s += inlay(cam, [[nx, 32.5, nz - 20], [nx + 30, 32.5, nz - 20], [nx + 30, 32.5, nz], [nx, 32.5, nz]], col);
      s += faceText(cam, "front", [nx + 15, 32.5, nz - 4], label, { size: 5.4, dy: 0, anchor: "middle", fill: "#2a1a24", weight: 800 });
      const [px, py] = cam.p(nx + 15, 33, nz - 2);
      s += `<circle cx="${px.toFixed(1)}" cy="${(py - 4 * cam.s / 1.6).toFixed(1)}" r="${(2.6 * cam.s / 1.6).toFixed(1)}" fill="#ff4d5e"/>`;
    });
    s += lamp(cam, T, x0 + 176, 40, 8, st);
    return { back: s };
  },
};

export const STATIONS = { inbox, calendar, contract, invoice, payment, gallery, phone, reminders };
