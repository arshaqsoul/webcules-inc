/* Galleries overview shaping (WEBC-115) — pure half of the page: active vs
 * inactive split and per-project grouping. */
import { describe, expect, it } from "vitest";

import { groupGrantsByProject, isActiveGrantRow, type GalleryGrantRow } from "@/lib/galleries-overview";

const row = (id: string, projectId: string, state: string, projectTitle = "T"): GalleryGrantRow => ({
  id,
  projectId,
  projectTitle,
  clientEmail: `${id}@t.test`,
  state,
  expiresAt: null,
  createdAt: "2026-10-25T00:00:00.000Z",
  allowDownload: true,
});

describe("isActiveGrantRow", () => {
  it("revoked, regenerated and expired are inactive; everything else is live", () => {
    for (const state of ["revoked", "regenerated", "expired"]) {
      expect(isActiveGrantRow({ state })).toBe(false);
    }
    for (const state of ["active", "expiring_soon", "scheduled"]) {
      expect(isActiveGrantRow({ state })).toBe(true);
    }
  });
});

describe("groupGrantsByProject", () => {
  it("groups rows per project, keeping the input (newest-first) order", () => {
    const groups = groupGrantsByProject([
      row("a", "p1", "active", "Alpha"),
      row("b", "p2", "active", "Beta"),
      row("c", "p1", "revoked", "Alpha"),
      row("d", "p1", "active", "Alpha"),
    ]);
    expect(groups.map((g) => g.projectId)).toEqual(["p1", "p2"]);
    expect(groups[0].projectTitle).toBe("Alpha");
    expect(groups[0].grants.map((g) => g.id)).toEqual(["a", "c", "d"]);
    expect(groups[1].grants.map((g) => g.id)).toEqual(["b"]);
  });

  it("returns [] for an empty list", () => {
    expect(groupGrantsByProject([])).toEqual([]);
  });
});
