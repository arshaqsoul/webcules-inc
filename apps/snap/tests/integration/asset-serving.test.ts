/* WEB-440 regression: a stored derivative key that fails the org-prefix
 * check (prod telemetry: `storage key outside organization prefix:
 * edit_key…`, 19×/24h on /api/assets/[id]) must degrade down the derivative
 * ladder — never an unhandled 500, and therefore never the gallery client's
 * 3× `&r=` retry storm.
 *
 * The route handler itself imports next/headers (getOrgContext) and so
 * cannot run under workerd tests (standing rule) — but /api/assets/[id] now
 * sources EVERY served derivative key through variantServeKey /
 * firstValidOrgKey (lib/assets-serving.ts), so these tests cover exactly the
 * selection the route performs, plus the repo clear path. Ownership is
 * untouched by design: the route still resolves the asset org-scoped
 * (staff) or behind a live grant (gallery) before any key is chosen. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { putObject } from "@/lib/storage/service";
import { firstValidOrgKey, variantServeKey, type DerivativeAsset } from "@/lib/assets-serving";
import { setAssetEdits } from "@/lib/repos/assets";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

const ORG = "11111111-1111-4111-8111-111111111111";

function assetWith(patch: Partial<DerivativeAsset>): DerivativeAsset {
  return {
    organizationId: ORG,
    storageKey: `${ORG}/x/original.jpg`,
    thumbKey: `${ORG}/x/thumb.jpg`,
    previewKey: `${ORG}/x/preview.jpg`,
    previewWmKey: null,
    editKey: null,
    ...patch,
  };
}

describe("variantServeKey — malformed stored keys degrade down the ladder (WEB-440)", () => {
  it("variant=thumb with a non-org edit_key falls back to the thumb key", () => {
    // The exact prod failure: an edit_key that doesn't sit under the org
    // prefix used to reach getObject and throw (500 + &r= retry storm).
    const key = variantServeKey(assetWith({ editKey: "edit_key/not-an-org-prefix/edited.jpg" }), "thumb");
    expect(key).toBe(`${ORG}/x/thumb.jpg`);
  });

  it("variant=preview with a malformed edit_key falls back to the preview", () => {
    expect(variantServeKey(assetWith({ editKey: "edit_key/bad" }), "preview")).toBe(`${ORG}/x/preview.jpg`);
  });

  it("variant=edited with a malformed edit_key degrades to preview, then thumb", () => {
    expect(variantServeKey(assetWith({ editKey: "edit_key/bad" }), "edited")).toBe(`${ORG}/x/preview.jpg`);
    expect(variantServeKey(assetWith({ editKey: "edit_key/bad", previewKey: null }), "edited")).toBe(`${ORG}/x/thumb.jpg`);
    // …and to nothing (route serves the original bytes) when no rung is valid.
    expect(variantServeKey(assetWith({ editKey: "edit_key/bad", previewKey: null, thumbKey: null }), "edited")).toBeNull();
  });

  it("variant=edited with NO stored edit key keeps serving the original (dk null, unchanged semantics)", () => {
    expect(variantServeKey(assetWith({ editKey: null }), "edited")).toBeNull();
  });

  it("a valid edit key is still preferred for thumb/preview/edited (WEB-402 semantics)", () => {
    const a = assetWith({ editKey: `${ORG}/x/edited.jpg` });
    expect(variantServeKey(a, "thumb")).toBe(`${ORG}/x/edited.jpg`);
    expect(variantServeKey(a, "preview")).toBe(`${ORG}/x/edited.jpg`);
    expect(variantServeKey(a, "edited")).toBe(`${ORG}/x/edited.jpg`);
  });

  it("preview_wm never falls back to the clean full preview — thumb only (audit fix preserved)", () => {
    expect(variantServeKey(assetWith({ previewWmKey: null }), "preview_wm")).toBe(`${ORG}/x/thumb.jpg`);
    // …and a MALFORMED wm key degrades to thumb, never to the clean preview.
    expect(variantServeKey(assetWith({ previewWmKey: "evil-org/wm.jpg" }), "preview_wm")).toBe(`${ORG}/x/thumb.jpg`);
    expect(variantServeKey(assetWith({ previewWmKey: `${ORG}/x/wm.jpg` }), "preview_wm")).toBe(`${ORG}/x/wm.jpg`);
  });

  it("an unknown/absent variant selects no derivative (original bytes)", () => {
    expect(variantServeKey(assetWith({}), null)).toBeNull();
    expect(variantServeKey(assetWith({}), "original")).toBeNull();
  });

  it("every non-null result is org-prefixed by construction — getObject's assert can never fire", () => {
    const cases: DerivativeAsset[] = [
      assetWith({ editKey: "edit_key/bad" }),
      assetWith({ editKey: "edit_key/bad", previewKey: "also-bad", thumbKey: "bad-too" }),
      assetWith({ editKey: `${ORG}/x/e.jpg`, previewKey: "bad", thumbKey: "bad" }),
      assetWith({ previewWmKey: "bad", thumbKey: "bad" }),
    ];
    for (const a of cases) {
      for (const variant of ["thumb", "preview", "preview_wm", "edited", null]) {
        const key = variantServeKey(a, variant);
        expect(key === null || key.startsWith(`${a.organizationId}/`)).toBe(true);
      }
    }
  });
});

describe("firstValidOrgKey", () => {
  it("skips nulls and malformed keys, returns the first org-prefixed one", () => {
    expect(firstValidOrgKey(ORG, [null, "edit_key/bad", `${ORG}/a.jpg`, `${ORG}/b.jpg`], "t")).toBe(`${ORG}/a.jpg`);
    expect(firstValidOrgKey(ORG, ["edit_key/bad", "other-org/x.jpg"], "t")).toBeNull();
    expect(firstValidOrgKey(ORG, [], "t")).toBeNull();
  });

  it("does not match a lookalike prefix (org id must be followed by /)", () => {
    expect(firstValidOrgKey(ORG, [`${ORG}-evil/x.jpg`, `${ORG}evil/x.jpg`], "t")).toBeNull();
  });

  it("warns (telemetry signal) instead of throwing when a stored key is dropped", () => {
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      expect(firstValidOrgKey(ORG, ["edit_key/bad", `${ORG}/ok.jpg`], "thumb variant")).toBe(`${ORG}/ok.jpg`);
    } finally {
      console.warn = orig;
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("dropping non-org-prefixed thumb variant key");
  });
});

describe("repo clear path (WEB-440)", () => {
  it("clearing edits with a malformed stored edit_key doesn't throw (bad delete skipped)", async () => {
    const s = await seedStudio();
    const p = await seedProject(s.organizationId);
    const id = await seedAsset({ organizationId: s.organizationId, projectId: p });
    await putObject(s.organizationId, `${p}/${id}/f.jpg`, new ArrayBuffer(8), "image/jpeg");
    await getDb()
      .update(schema.assets)
      .set({ editKey: "edit_key/bad", edits: JSON.stringify({ exposure: 0.4 }) })
      .where(eq(schema.assets.id, id));
    const r = await setAssetEdits(s.organizationId, id, null);
    expect(r.ok).toBe(true);
    const row = await getDb().select({ editKey: schema.assets.editKey }).from(schema.assets).where(eq(schema.assets.id, id)).limit(1);
    expect(row[0]?.editKey).toBeNull();
  });
});
