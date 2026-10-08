// Run: node --test growth/scripts/reel.test.mjs
// The things a new agent relies on: the pre-flight checker, the safe-recipient guard, the launch record kind.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SB = path.join(ROOT, "growth", "storyboards");
const made = [];

const run = (script, args, env = {}) => spawnSync("node", [path.join(HERE, script), ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const reel = (args, env) => run("reel.mjs", args, env);

/** Scaffold a throwaway record and fill it with valid content, then let a test break one thing. */
function validReel(id, takeSource) {
  assert.equal(reel(["new", id]).status, 0);
  const f = (ext) => path.join(SB, `${id}${ext}`);
  made.push(f(".md"), f(".meta.json"), f(".take.mjs"));
  fs.writeFileSync(f(".md"), "# Storyboard\n\n## Claims\n\n| claim | source |\n|---|---|\n\n## Do not show\n\nNothing private.\n");
  fs.writeFileSync(f(".meta.json"), JSON.stringify({ hook: "A short hook", end: { claim: "All in one place", link: "snaphq.app" }, claims: [{ text: "Free plan", source: "apps/snap/lib/plans-data.ts" }] }));
  fs.writeFileSync(
    f(".take.mjs"),
    takeSource ??
      `export const format = "desktop";
export async function run({ p, page }) {
  p.step("s1", "Open the overview");
  await p.settle(700);
  await p.hold(1500, { label: "payoff" });
}
`,
  );
  return id;
}

after(() => made.forEach((f) => fs.rmSync(f, { force: true })));

test("the real PP-003 example passes the pre-flight check", () => {
  const r = reel(["check", "PP-003"]);
  assert.equal(r.status, 0, r.stdout);
});

test("a fresh scaffold is refused until it is filled in", () => {
  assert.equal(reel(["new", "PP-986"]).status, 0);
  made.push(...["md", "meta.json", "take.mjs"].map((e) => path.join(SB, `PP-986.${e}`)));
  const r = reel(["check", "PP-986"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /placeholder/);
});

test("scaffolding never overwrites existing work", () => {
  assert.equal(reel(["new", "PP-003"]).status, 1);
});

test("a valid take passes, a take that clicks around the performer fails", () => {
  validReel("PP-985");
  assert.equal(reel(["check", "PP-985"]).status, 0);
  const id = validReel("PP-984", `export async function run({ p, page }) {
  p.step("s1", "Open the overview");
  await page.getByRole("link", { name: "Galleries" }).click();
  await p.hold(1500, { label: "payoff" });
}
`);
  const r = reel(["check", id]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /directly/);
});

test("a take with no step, or a caption over 6 words, fails", () => {
  const a = validReel("PP-983", `export async function run({ p }) { await p.hold(1000, { label: "payoff" }); }\n`);
  assert.match(reel(["check", a]).stdout, /p\.step/);
  const b = validReel("PP-982", `export async function run({ p }) {
  p.step("s1", "This caption is far too long to read");
  await p.hold(1000, { label: "payoff" });
}
`);
  assert.match(reel(["check", b]).stdout, /words, max 6/);
});

test("an em dash anywhere fails", () => {
  const id = validReel("PP-981");
  fs.appendFileSync(path.join(SB, `${id}.md`), "\nA sentence — with an em dash.\n");
  assert.match(reel(["check", id]).stdout, /em dash/);
});

test("a claim citing a missing file fails", () => {
  const id = validReel("PP-980");
  const mp = path.join(SB, `${id}.meta.json`);
  const m = JSON.parse(fs.readFileSync(mp, "utf8"));
  m.claims.push({ text: "Made up", source: "apps/snap/lib/does-not-exist.ts" });
  fs.writeFileSync(mp, JSON.stringify(m));
  assert.match(reel(["check", id]).stdout, /does not exist/);
});

test("a take that sends email to an address outside GROWTH_SAFE_EMAILS is refused by check AND by the recorder, before anything runs", () => {
  const src = `export const format = "desktop";
export const mask = { allowEmails: ["stranger@example.com"] };
export const sendsEmail = true;
export async function run({ p }) {
  p.step("s1", "Send the link");
  await p.hold(1000, { label: "payoff" });
}
`;
  const id = validReel("PP-979", src);
  const env = { GROWTH_SAFE_EMAILS: "me@example.com" };
  const c = reel(["check", id], env);
  assert.equal(c.status, 1);
  assert.match(c.stdout, /not in GROWTH_SAFE_EMAILS/);

  const rec = run("record/record.mjs", ["--pp", id, "--take", `growth/storyboards/${id}.take.mjs`], env);
  assert.equal(rec.status, 1);
  assert.match(rec.stderr, /REFUSED/);
  assert.equal(fs.existsSync(path.join(ROOT, "growth", "recordings", id)), false, "the recorder must refuse before it creates or wipes any folder");

  // and the same take passes once the recipient is allow-listed
  assert.equal(reel(["check", id], { GROWTH_SAFE_EMAILS: "stranger@example.com" }).status, 0);
});

test("a launch record validates against a brief instead of public evidence", () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "growth-launch-"));
  const L = (...a) => spawnSync("node", [path.join(HERE, "ledger.mjs"), ...a], { encoding: "utf8", env: { ...process.env, GROWTH_STATE_DIR: state } });
  const created = JSON.parse(L("new", "--kind", "launch", "--title", "Snap launch reel", "--statement", "Introduce Snap to working photographers.", "--persona", "any", "--severity", "3").stdout);
  assert.equal(created.kind, "launch");
  assert.notEqual(L("transition", created.id, "VALIDATED", "--by", "orchestrator").status, 0, "needs a brief");
  const ok = L("transition", created.id, "VALIDATED", "--by", "orchestrator", "--set", "launch.brief=growth/README.md");
  assert.equal(ok.status, 0, ok.stderr);
});
