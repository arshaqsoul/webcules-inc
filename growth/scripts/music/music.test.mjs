// Run: node --test growth/scripts/music/music.test.mjs
// End to end with the stand-in engine (no model needed): plan, generate, measure, align, mix, mux, QC.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorkflow, REQUIRED_NODES, AIO_CKPT } from "./comfy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const ID = "PP-974";
const OUT = path.join(ROOT, "growth", "out", ID);

after(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  const dir = path.join(ROOT, "growth", "assets", "music");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.includes(`-${Number(ID.slice(3)) * 1000}-`)) fs.rmSync(path.join(dir, f), { force: true });
});

function makeReel() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30", "-t", "14", "-vf", "format=yuv420p", "-c:v", "libx264", "-an", path.join(OUT, "reel.mp4")]);
  assert.equal(r.status, 0, String(r.stderr));
  const edl = {
    fps: 30,
    duration_ms: 14000,
    main_ms: 12000,
    endcard_start_ms: 12000,
    hook: "A short hook",
    captions: [
      { index: 0, text: "First step", words: 2, start_ms: 1550, end_ms: 4500 },
      { index: 1, text: "Second step", words: 2, start_ms: 4800, end_ms: 8000 },
      { index: 2, text: "Third step", words: 2, start_ms: 8300, end_ms: 11800 },
    ],
    highlights: [{ event_index: 1, out_ms: 3000 }, { event_index: 2, out_ms: 6000 }],
    ramps: [],
    end: { claim: "All in one place", link: "snap.webcules.com" },
    claims: [],
    clicks_total: 0,
    clicks_covered: 0,
    layout: [{ kind: "caption", text: "First step", x: 120, y: 330, w: 600, h: 90, clipped: false }],
  };
  fs.writeFileSync(path.join(OUT, "edl.json"), JSON.stringify(edl, null, 2));
  return edl;
}
const music = (...a) => spawnSync("node", [path.join(HERE, "music.mjs"), "--pp", ID, ...a], { encoding: "utf8" });
const qc = (...a) => spawnSync("node", [path.join(ROOT, "growth", "scripts", "qc", "qc.mjs"), "--pp", ID, "--variant", "music", ...a], { encoding: "utf8" });

test("stand-in pipeline: measures the drifted tempo, stretches it back, lands the step changes on beats", () => {
  makeReel();
  const r = music("--engine", "standin", "--standin-skew", "3");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(OUT, "music.json"), "utf8"));
  assert.equal(m.engine, "standin");
  // the generator drifted 3 percent fast: the analyser must see it and the editor must undo it
  assert.ok(Math.abs(m.bpm_measured / m.bpm_planned - 1.03) < 0.012, `measured ${m.bpm_measured} planned ${m.bpm_planned}`);
  assert.ok(Math.abs(m.bpm_final - m.bpm_planned) < 1.5, `final ${m.bpm_final}`);
  assert.ok(m.alignment.ratio >= 0.8, JSON.stringify(m.alignment));
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels", "-of", "csv=p=0", path.join(OUT, "reel.music.mp4")], { encoding: "utf8" }).stdout;
  assert.match(probe, /aac,48000,2/);
});

test("the original reel is never modified", () => {
  makeReel();
  const before = fs.readFileSync(path.join(OUT, "reel.mp4"));
  assert.equal(music("--engine", "standin").status, 0);
  assert.ok(before.equals(fs.readFileSync(path.join(OUT, "reel.mp4"))));
});

test("QC refuses to pass a stand-in for posting, and passes it only with the explicit flag", () => {
  makeReel();
  assert.equal(music("--engine", "standin").status, 0);
  const strict = qc();
  assert.notEqual(strict.status, 0);
  assert.match(strict.stdout, /FAIL\s+music is generated/);
  const lenient = qc("--allow-standin");
  assert.match(lenient.stdout, /PASS\s+music is generated/);
  for (const must of ["moments on the beat", "end card hit on the beat", "music not over-stretched", "music tempo is steady", "music is continuous", "music matches this edit"]) {
    assert.match(lenient.stdout, new RegExp(`PASS\\s+${must}`), must);
  }
});

test("QC catches a music version that is stale because the reel was re-edited", () => {
  makeReel();
  assert.equal(music("--engine", "standin").status, 0);
  fs.appendFileSync(path.join(OUT, "edl.json"), "\n"); // any change to the edit list after the music was made
  const r = qc("--allow-standin");
  assert.match(r.stdout, /FAIL\s+music matches this edit/);
});

test("the comfy engine refuses cleanly when the model is not installed, writing nothing", () => {
  makeReel();
  // point at a port nothing listens on: unreachable server is the other not-ready case
  const r = spawnSync("node", [path.join(HERE, "music.mjs"), "--pp", ID], { encoding: "utf8", env: { ...process.env, GROWTH_COMFY_URL: "http://127.0.0.1:9" } });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /not (ready|reachable)/i);
  assert.equal(fs.existsSync(path.join(OUT, "reel.music.mp4")), false);
});

test("the ACE-Step workflow is a closed, valid graph for both model layouts", () => {
  for (const variant of ["aio", "split"]) {
    const wf = buildWorkflow(variant, { tags: "x", seed: 1, bpm: 110, seconds: 20, keyscale: "A minor" });
    for (const [id, node] of Object.entries(wf)) {
      assert.ok(node.class_type, `${variant}:${id} has a class_type`);
      for (const v of Object.values(node.inputs)) if (Array.isArray(v)) assert.ok(wf[v[0]], `${variant}: node ${id} points at missing node ${v[0]}`);
    }
    const types = Object.values(wf).map((n) => n.class_type);
    for (const need of REQUIRED_NODES) assert.ok(types.includes(need), `${variant} uses ${need}`);
    assert.equal(wf["2"].inputs.bpm, 110);
    assert.equal(wf["5"].inputs.seconds, 20);
  }
  assert.equal(buildWorkflow("aio", { tags: "x", seed: 1, bpm: 110, seconds: 5 })["1"].inputs.ckpt_name, AIO_CKPT);
});
