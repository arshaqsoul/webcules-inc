// The performer: every interaction in a demo goes through here, never through raw Playwright calls.
// It makes the take look like a calm person using real software (see growth/DEMO-STANDARD.md)
// and logs every action with a timestamp and element box into the events timeline the editor reads.

/** Small seeded PRNG so a re-record with the same seed has the same motion. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Injected into every document. The visible cursor is NOT drawn in the page: the editor draws it from the
 *  logged path (smooth at 30 fps, crisp at any zoom). The page only reports what kind of cursor it would show. */
export const CURSOR_INIT = `(() => {
  if (window.__growthKindInit) return;
  window.__growthKind = 'default';
  addEventListener('mousemove', (e) => {
    const t = e.target;
    let k = 'default';
    if (t && t.nodeType === 1) {
      const c = getComputedStyle(t).cursor;
      if (c === 'pointer') k = 'pointer';
      else if (c === 'text' || t.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,[contenteditable=true]')) k = 'text';
    }
    window.__growthKind = k;
  }, true);
  window.__growthKindInit = true;
})();`;

export function createPerformer(page, { seed, epoch, viewport }) {
  const rand = rng(seed);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const events = [];
  const steps = [];
  const path = []; // high-rate cursor samples: {t_ms, x, y}
  let pos = { x: Math.round(viewport.width * 0.62), y: Math.round(viewport.height * 0.58) };
  let currentStep = null;

  const now = () => Date.now() - epoch;
  async function mv(x, y) {
    await page.mouse.move(x, y);
    path.push({ t_ms: Math.round(now()), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }
  const kind = () => page.evaluate(() => window.__growthKind || "default").catch(() => "default");
  const log = (e) => events.push({ t_ms: Math.round(now()), ...e });
  const round = (b) => (b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width ?? b.w), h: Math.round(b.height ?? b.h) } : undefined);

  /** An element's box once it has stopped moving. Apps often scroll or re-layout after an action (a banner inserts,
   *  a smooth scroll), and a box measured mid-motion puts the cursor and the editor's highlight in the wrong place. */
  async function box(target, { need = 1, gap = 120 } = {}) {
    if (typeof target?.boundingBox !== "function") return null;
    await target.waitFor({ state: "visible", timeout: 15000 });
    let prev = await target.boundingBox();
    let still = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(gap);
      const cur = await target.boundingBox();
      const same = cur && prev && Math.abs(cur.x - prev.x) < 0.5 && Math.abs(cur.y - prev.y) < 0.5 && Math.abs(cur.width - prev.width) < 0.5 && Math.abs(cur.height - prev.height) < 0.5;
      still = same ? still + 1 : 0;
      prev = cur;
      if (still >= need) return cur;
    }
    return prev;
  }

  async function glideTo(x, y, { overshoot = true } = {}) {
    const dx = x - pos.x;
    const dy = y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;
    const duration = clamp(350 + dist * 0.42, 350, 900);
    // Curved path: a cubic Bezier bowed to one side, never a straight laser line.
    const nx = -dy / dist;
    const ny = dx / dist;
    const bow = (rand() < 0.5 ? -1 : 1) * dist * between(0.04, 0.1);
    const c1 = { x: pos.x + dx * 0.3 + nx * bow, y: pos.y + dy * 0.3 + ny * bow };
    const c2 = { x: pos.x + dx * 0.72 + nx * bow * 0.6, y: pos.y + dy * 0.72 + ny * bow * 0.6 };
    const over = overshoot && dist > 600 ? { x: x + (dx / dist) * between(2, 6), y: y + (dy / dist) * between(2, 6) } : { x, y };
    const p0 = { ...pos };
    const end1 = over;
    const start = Date.now();
    for (;;) {
      const k = clamp((Date.now() - start) / duration, 0, 1);
      const e = easeInOut(k);
      const u = 1 - e;
      const px = u * u * u * p0.x + 3 * u * u * e * c1.x + 3 * u * e * e * c2.x + e * e * e * end1.x;
      const py = u * u * u * p0.y + 3 * u * u * e * c1.y + 3 * u * e * e * c2.y + e * e * e * end1.y;
      await mv(px, py);
      if (k >= 1) break;
      await sleep(8);
    }
    if (end1.x !== x || end1.y !== y) {
      const s2 = Date.now();
      const settle = 130;
      for (;;) {
        const k = easeOut(clamp((Date.now() - s2) / settle, 0, 1));
        await mv(end1.x + (x - end1.x) * k, end1.y + (y - end1.y) * k);
        if (k >= 1) break;
        await sleep(8);
      }
    }
    pos = { x, y };
  }

  /** A believable aim point: inside the element, slightly off-centre, never the exact middle. */
  function aim(b) {
    const ax = b.x + b.width * clamp(0.5 + between(-0.18, 0.18), 0.2, 0.8);
    const ay = b.y + b.height * clamp(0.5 + between(-0.15, 0.15), 0.25, 0.75);
    return { x: ax, y: ay };
  }

  async function ensureVisible(target) {
    const b = await box(target);
    if (!b) return b;
    const margin = 40;
    if (b.y < margin || b.y + b.height > viewport.height - margin) {
      const delta = b.y + b.height / 2 - viewport.height / 2;
      await scrollBy(delta);
      return box(target);
    }
    return b;
  }

  async function scrollBy(totalDy, { duration } = {}) {
    const d = duration ?? clamp(400 + Math.abs(totalDy) * 0.6, 400, 800);
    log({ type: "scroll", x: Math.round(pos.x), y: Math.round(pos.y), text: String(Math.round(totalDy)), ...(currentStep ? { step: currentStep } : {}) });
    const start = Date.now();
    let sent = 0;
    for (;;) {
      const k = clamp((Date.now() - start) / d, 0, 1);
      const want = totalDy * easeInOut(k);
      const dy = want - sent;
      if (Math.abs(dy) >= 1) {
        await page.mouse.wheel(0, dy);
        sent += dy;
      }
      if (k >= 1) break;
      await sleep(12);
    }
    await sleep(250);
  }

  return {
    events,
    steps,
    path,
    get position() {
      return pos;
    },

    /** Mark the start of a storyboard step. The previous step ends here. */
    step(id, caption) {
      const t = Math.round(now());
      if (steps.length) steps[steps.length - 1].t_end_ms = t;
      steps.push({ id, caption, t_start_ms: t, t_end_ms: t });
      currentStep = id;
    },

    async placeCursor() {
      await mv(pos.x, pos.y);
    },

    async move(target) {
      const b = await ensureVisible(target);
      const p = b ? aim(b) : target;
      log({ type: "move", x: Math.round(p.x), y: Math.round(p.y), ...(currentStep ? { step: currentStep } : {}) });
      await glideTo(p.x, p.y);
    },

    async hover(target, dwell) {
      const b = await ensureVisible(target);
      const p = b ? aim(b) : target;
      await glideTo(p.x, p.y);
      log({ type: "hover", x: Math.round(p.x), y: Math.round(p.y), box: round(b), cursor: await kind(), ...(currentStep ? { step: currentStep } : {}) });
      await sleep(dwell ?? between(220, 420));
    },

    async click(target, { selector } = {}) {
      const b = await ensureVisible(target);
      const p = b ? aim(b) : target;
      await glideTo(p.x, p.y);
      await sleep(between(120, 300)); // dwell: a person reads the target before clicking
      log({ type: "click", x: Math.round(p.x), y: Math.round(p.y), box: round(b), cursor: await kind(), ...(selector ? { selector } : {}), ...(currentStep ? { step: currentStep } : {}) });
      await page.mouse.down();
      await sleep(between(55, 110));
      await page.mouse.up();
      await sleep(between(180, 320));
    },

    async type(target, text) {
      await this.click(target);
      log({ type: "type", text, box: round(await box(target)), ...(currentStep ? { step: currentStep } : {}) });
      for (const ch of text) {
        await page.keyboard.type(ch);
        const beat = /[\s.,;:@-]/.test(ch) ? between(150, 300) : between(45, 110);
        await sleep(beat);
      }
      await sleep(between(250, 450));
    },

    /** Operate a native <select> the way a person does: click to open, arrow keys to move, Enter to choose.
     *  The native popup is not captured in frames, so the timing of each step is logged on the event and the
     *  editor draws the dropdown from it. */
    async select(target, label) {
      const options = await target.evaluate((el) => [...el.options].map((o) => o.text.trim()));
      const from = await target.evaluate((el) => el.selectedIndex);
      const to = options.findIndex((l) => l.toLowerCase() === label.toLowerCase());
      if (to < 0) throw new Error(`select: no option "${label}" in [${options.join(", ")}]`);
      await this.click(target);
      const ev = { t_ms: Math.round(now()), type: "select", text: label, box: round(await box(target)), options, from, to, steps_ms: [], ...(currentStep ? { step: currentStep } : {}) };
      events.push(ev);
      await sleep(between(380, 520)); // the popup is open, a person reads the options
      const key = to > from ? "ArrowDown" : "ArrowUp";
      for (let i = 0; i < Math.abs(to - from); i++) {
        await page.keyboard.press(key);
        ev.steps_ms.push(Math.round(now()));
        await sleep(between(240, 340));
      }
      await sleep(between(120, 200));
      await page.keyboard.press("Enter");
      const shown = () => target.evaluate((el) => el.options[el.selectedIndex].text.trim());
      if ((await shown()).toLowerCase() !== label.toLowerCase()) {
        // Headless Chrome's native popup may not take keyboard input. Commit through the real change event instead;
        // the dropdown the viewer sees is drawn by the editor from the logged steps either way.
        await target.selectOption({ label });
        ev.committed_via = "selectOption";
      }
      ev.commit_ms = Math.round(now());
      const got = await shown();
      if (got.toLowerCase() !== label.toLowerCase()) throw new Error(`select: wanted "${label}" but the control shows "${got}"`);
      await sleep(between(400, 600));
    },

    /** Point the camera at something without touching it (a banner, a result). Logged as an annotate event the editor zooms to. */
    async focus(target, { label, tight } = {}) {
      let b = await box(target, { need: 4, gap: 200 }); // 0.8 s of stillness: late re-layouts must not leave the highlight behind
      if (tight) {
        // a block element spans its whole row; measure just the text so the zoom and highlight hug it
        b = await target.evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          const x = r.getBoundingClientRect();
          return { x: x.x, y: x.y, width: x.width, height: x.height };
        });
      }
      log({ type: "annotate", box: round(b), text: label ?? "focus", ...(currentStep ? { step: currentStep } : {}) });
    },

    async scroll(dy, opts) {
      await scrollBy(dy, opts);
    },

    /** Navigate, wait for real content, then let the viewer read the screen. */
    async navigate(url) {
      log({ type: "navigate", text: url, ...(currentStep ? { step: currentStep } : {}) });
      await page.goto(url, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await mv(pos.x, pos.y);
      await sleep(between(500, 750));
    },

    /** After a click that changes the screen: wait for it to settle, then pause so it can be read. */
    async settle(ms) {
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await sleep(ms ?? between(500, 750));
    },

    /** Hold on a screen. The cursor drifts a pixel or two so the take never looks frozen. */
    async hold(ms, { label } = {}) {
      log({ type: "wait", text: label ?? "hold", ...(currentStep ? { step: currentStep } : {}) });
      const start = Date.now();
      while (Date.now() - start < ms) {
        const k = (Date.now() - start) / 1000;
        await mv(pos.x + Math.sin(k * 2.1) * 1.4, pos.y + Math.cos(k * 1.7) * 1.1);
        await sleep(90);
      }
    },

    finish() {
      const t = Math.round(now());
      if (steps.length) steps[steps.length - 1].t_end_ms = t;
    },
  };
}
