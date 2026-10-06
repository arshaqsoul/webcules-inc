// Run: node --test growth/scripts/sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncable, localFiles, dirStore, status, push, pull, remove } from "./sync.mjs";

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), "growth-sync-"));
const put = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const quiet = () => {};

test("only finished media is allowed to leave the machine", () => {
  for (const ok of ["growth/out/PP-003/music.ethereal.edl.json", "growth/packages/PP-003/reel.mp4", "growth/packages/PP-003/cover.png", "growth/out/PP-004/reel.music.mp4", "growth/out/PP-004/edl.json", "growth/out/PP-004/qc.music.json", "growth/assets/music/abc123.flac"]) {
    assert.equal(syncable(ok), true, ok);
  }
});

test("mailbox crops, secrets, raw footage, ledger state and failure screenshots never sync", () => {
  for (const no of [
    "growth/assets/PP-003/inbox-1.png",
    "growth/assets/PP-003/inbox-2.png",
    "growth/.env.local",
    "growth/state/pain-points/PP-001.json",
    "growth/locks/staging.lock.json",
    "growth/recordings/PP-003/raw.mp4",
    "growth/recordings/PP-003/frames/000001.jpg",
    "growth/recordings/PP-003/failure.png",
    "growth/out/PP-003/failure.png",
    "apps/snap/.dev.vars",
    "growth/packages/PP-003/package.md",
  ]) {
    assert.equal(syncable(no), false, no);
  }
});

test("push then pull moves a reel between two PCs, byte for byte", () => {
  const store = dirStore(mk());
  const a = mk();
  const b = mk();
  put(a, "growth/packages/PP-003/reel.mp4", "VIDEO-BYTES-A");
  put(a, "growth/packages/PP-003/cover.png", "PNG-BYTES");
  put(a, "growth/assets/PP-003/inbox-1.png", "MAILBOX SCREENSHOT"); // must not travel
  put(a, "growth/recordings/PP-003/raw.mp4", "RAW");
  const r = push({ store, root: a, log: quiet });
  assert.equal(r.pushed.length, 2);
  const p = pull({ store, root: b, log: quiet });
  assert.equal(p.pulled.length, 2);
  assert.equal(fs.readFileSync(path.join(b, "growth/packages/PP-003/reel.mp4"), "utf8"), "VIDEO-BYTES-A");
  assert.equal(fs.existsSync(path.join(b, "growth/assets/PP-003/inbox-1.png")), false);
  assert.equal(fs.existsSync(path.join(b, "growth/recordings/PP-003/raw.mp4")), false);
});

test("a stand-in music version never syncs, a real one does", () => {
  const a = mk();
  put(a, "growth/out/PP-004/reel.mp4", "v");
  put(a, "growth/out/PP-004/reel.music.mp4", "standin audio");
  put(a, "growth/out/PP-004/music.json", JSON.stringify({ engine: "standin" }));
  put(a, "growth/assets/music/standin-118-41-4000-0.wav", "wav");
  let files = Object.keys(localFiles(a));
  assert.deepEqual(files.sort(), ["growth/out/PP-004/reel.mp4"]);
  put(a, "growth/out/PP-004/music.json", JSON.stringify({ engine: "comfy" }));
  put(a, "growth/assets/music/abc.flac", "flac");
  files = Object.keys(localFiles(a));
  assert.ok(files.includes("growth/out/PP-004/reel.music.mp4") && files.includes("growth/assets/music/abc.flac"));
});

test("a second push uploads nothing when nothing changed, and only the changed file when one did", () => {
  const store = dirStore(mk());
  const a = mk();
  put(a, "growth/out/PP-004/reel.mp4", "v1");
  put(a, "growth/out/PP-004/cover.png", "c1");
  assert.equal(push({ store, root: a, log: quiet }).pushed.length, 2);
  assert.equal(push({ store, root: a, log: quiet }).pushed.length, 0);
  put(a, "growth/out/PP-004/reel.mp4", "v2-longer");
  const r = push({ store, root: a, log: quiet });
  assert.deepEqual(r.pushed, ["growth/out/PP-004/reel.mp4"]);
});

test("dry run changes nothing", () => {
  const store = dirStore(mk());
  const a = mk();
  put(a, "growth/out/PP-004/reel.mp4", "v1");
  const r = push({ store, root: a, dry: true, log: quiet });
  assert.equal(r.would.length, 1);
  assert.equal(store.get("v1/manifest.json"), null);
});

test("a corrupted download is refused and not written", () => {
  const store = dirStore(mk());
  const a = mk();
  const b = mk();
  put(a, "growth/out/PP-004/reel.mp4", "GOOD");
  push({ store, root: a, log: quiet });
  store.put("v1/growth/out/PP-004/reel.mp4", Buffer.from("TAMPERED"));
  const p = pull({ store, root: b, log: quiet });
  assert.equal(p.pulled.length, 0);
  assert.equal(fs.existsSync(path.join(b, "growth/out/PP-004/reel.mp4")), false);
});

test("a manifest entry for a path that is not allowed is refused on pull", () => {
  const store = dirStore(mk());
  const b = mk();
  store.put("v1/growth/.env.local", Buffer.from("SECRET"));
  store.put("v1/manifest.json", Buffer.from(JSON.stringify({ version: 1, files: { "growth/.env.local": { size: 6, sha256: "x", updated_at: new Date().toISOString() } } })));
  const p = pull({ store, root: b, log: quiet });
  assert.equal(p.pulled.length, 0);
  assert.equal(fs.existsSync(path.join(b, "growth/.env.local")), false);
});

test("a file that differs and is newer in the bucket is skipped unless forced", () => {
  const store = dirStore(mk());
  const a = mk();
  const b = mk();
  put(a, "growth/out/PP-004/reel.mp4", "from-a");
  push({ store, root: a, log: quiet });
  put(b, "growth/out/PP-004/reel.mp4", "older-local");
  const old = new Date(Date.now() - 3600_000);
  fs.utimesSync(path.join(b, "growth/out/PP-004/reel.mp4"), old, old);
  const s = pull({ store, root: b, log: quiet });
  assert.equal(s.pulled.length, 0);
  assert.equal(s.skipped.length, 1);
  assert.equal(pull({ store, root: b, force: true, log: quiet }).pulled.length, 1);
  assert.equal(fs.readFileSync(path.join(b, "growth/out/PP-004/reel.mp4"), "utf8"), "from-a");
});

test("remove deletes from the bucket and the manifest but leaves local files alone", () => {
  const store = dirStore(mk());
  const a = mk();
  put(a, "growth/out/PP-004/reel.mp4", "keep");
  put(a, "growth/out/PP-004/reel.music.old.mp4", "drop");
  push({ store, root: a, log: quiet });
  const r = remove({ store, rels: ["growth/out/PP-004/reel.music.old.mp4", "growth/out/PP-004/never-uploaded.mp4"], log: quiet });
  assert.deepEqual(r.removed, ["growth/out/PP-004/reel.music.old.mp4"]);
  assert.equal(store.get("v1/growth/out/PP-004/reel.music.old.mp4"), null);
  assert.ok(fs.existsSync(path.join(a, "growth/out/PP-004/reel.music.old.mp4")), "local copy untouched");
  const b = mk();
  assert.deepEqual(pull({ store, root: b, log: quiet }).pulled, ["growth/out/PP-004/reel.mp4"]);
});
