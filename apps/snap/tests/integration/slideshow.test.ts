/* WEB-259 slideshow — library CRUD (R2-backed), per-project config writes
 * with the Free-tier music strip, tier resolution, the "only the selected
 * track is served" coupling, and view-budget pacing. */
import { beforeEach, describe, expect, it } from "vitest";

import { createTrack, deleteTrack, getProjectSlideshow, getTrack, listTracks, saveProjectSlideshow, slideshowForTier } from "@/lib/repos/slideshow";
import { checkImageView, IP_VIEWS_PER_MIN } from "@/lib/limits";
import { MUSIC_MAX_BYTES, parseSlideshowConfigJson, serializeSlideshowConfig, type SlideshowConfig } from "@/lib/slideshow";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

const CFG: SlideshowConfig = { enabled: true, pace: 5, transition: "kenburns", music: "", musicStartAt: 0 };

async function seedTrack(organizationId: string, name = "First dance.mp3", bytes = 1024) {
  return createTrack({ organizationId, name, storageKey: `${organizationId}/audio/t1/${name}`, mimeType: "audio/mpeg", bytes });
}

describe("track library (WEB-259)", () => {
  it("creates, lists per-org, deletes (R2 cleanup best-effort)", async () => {
    const a = await seedStudio();
    const b = await seedStudio();
    await seedTrack(a.organizationId);
    await createTrack({ organizationId: b.organizationId, name: "other.mp3", storageKey: `${b.organizationId}/audio/x/other.mp3`, mimeType: "audio/mpeg", bytes: 1 });
    expect((await listTracks(a.organizationId)).map((t) => t.name)).toEqual(["First dance.mp3"]);

    const [only] = await listTracks(a.organizationId);
    expect(await deleteTrack(a.organizationId, only.id)).toBe(true);
    expect(await deleteTrack(a.organizationId, only.id)).toBe(false); // gone
    // Cross-org getTrack never resolves.
    expect(await getTrack(b.organizationId, (await listTracks(b.organizationId))[0].id)).not.toBeNull();
    expect((await listTracks(a.organizationId)).length).toBe(0);
  });
});

describe("saveProjectSlideshow (WEB-259)", () => {
  it("stores a canonical enabled config and reads it back", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const res = await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: { ...CFG, pace: 8, transition: "fade" }, lite: true });
    expect(res).toEqual({ ok: true });
    expect(parseSlideshowConfigJson(serializeSlideshowConfig({ ...CFG, pace: 8, transition: "fade" }))).toEqual({ ...CFG, pace: 8, transition: "fade" });
    expect(await getProjectSlideshow(s.organizationId, p)).toEqual({ ...CFG, pace: 8, transition: "fade" });
  });

  it("disabled config or null clears (no slideshow button)", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: { ...CFG, enabled: false }, lite: true });
    expect(await getProjectSlideshow(s.organizationId, p)).toBeNull();
    await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: CFG, lite: true });
    await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: null, lite: true });
    expect(await getProjectSlideshow(s.organizationId, p)).toBeNull();
  });

  it("a selected track must exist in this org", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const res = await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: { ...CFG, music: "missing" }, lite: true });
    expect(res).toEqual({ ok: false, error: "track_not_found" });

    const track = await seedTrack(s.organizationId);
    expect(await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: { ...CFG, music: track.id }, lite: true })).toEqual({ ok: true });

    // Another org's track is as good as missing.
    const other = await seedStudio({ plan: "lite" });
    const p2 = await seedProject(other.organizationId);
    expect(await saveProjectSlideshow({ organizationId: other.organizationId, projectId: p2, config: { ...CFG, music: track.id }, lite: true })).toEqual({
      ok: false,
      error: "track_not_found",
    });
  });

  it("Free tier: the basic slideshow saves, the track is stripped server-side", async () => {
    const s = await seedStudio({ plan: "free" });
    const p = await seedProject(s.organizationId);
    const track = await seedTrack(s.organizationId); // uploaded while Lite, say
    expect(await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: { ...CFG, music: track.id }, lite: false })).toEqual({ ok: true });
    const stored = await getProjectSlideshow(s.organizationId, p);
    expect(stored!.enabled).toBe(true);
    expect(stored!.music).toBe("");
    // The render-side resolver agrees — Free never receives audio.
    expect(slideshowForTier(stored, false)!.music).toBe("");
  });

  it("oversized tracks are refused at config time too", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const fat = await seedTrack(s.organizationId, "fat.mp3", MUSIC_MAX_BYTES + 1);
    expect(await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: { ...CFG, music: fat.id }, lite: true })).toEqual({
      ok: false,
      error: "too_large",
    });
  });
});

describe("selected-track-only serving (WEB-259)", () => {
  it("mirrors the gallery route: a track is servable only when it is the picked one for that org+project", async () => {
    const s = await seedStudio({ plan: "lite" });
    const p = await seedProject(s.organizationId);
    const picked = await seedTrack(s.organizationId, "picked.mp3");
    const stray = await createTrack({ organizationId: s.organizationId, name: "stray.mp3", storageKey: `${s.organizationId}/audio/t2/stray.mp3`, mimeType: "audio/mpeg", bytes: 1 });
    await saveProjectSlideshow({ organizationId: s.organizationId, projectId: p, config: { ...CFG, music: picked.id }, lite: true });

    const servable = async (trackId: string) => {
      const cfg = await getProjectSlideshow(s.organizationId, p);
      const effective = slideshowForTier(cfg, true);
      if (!effective?.music || effective.music !== trackId) return false;
      return Boolean(await getTrack(s.organizationId, trackId));
    };
    expect(await servable(picked.id)).toBe(true);
    expect(await servable(stray.id)).toBe(false); // in the library, not picked
    expect(await servable("nope")).toBe(false);

    // Free downgrade mid-flight kills even the picked track.
    expect(slideshowForTier(await getProjectSlideshow(s.organizationId, p), false)!.music).toBe("");
  });
});

describe("view budgets vs slideshow pacing (WEB-259)", () => {
  it("the fastest pace (3 s slides + 2 preloads) stays under the per-IP minute window", async () => {
    const s = await seedStudio();
    const ip = `slideshow-${crypto.randomUUID()}`;
    let allowed = 0;
    for (let i = 0; i < 22; i++) {
      // 20 slides/min + 2 look-ahead fetches
      const r = await checkImageView(ip, s.organizationId, "g");
      if (r.ok) allowed++;
    }
    expect(allowed).toBe(22);
    expect(IP_VIEWS_PER_MIN).toBeGreaterThanOrEqual(22);
  });
});
