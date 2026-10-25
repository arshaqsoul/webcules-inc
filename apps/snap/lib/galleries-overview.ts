/* Galleries overview shaping (pure — no server imports, unit-testable).
 * WEBC-115: the Galleries page groups links per project and hides the dead
 * ones (revoked / regenerated / expired) behind a "Show inactive" toggle, so
 * the page reads as the studio's live galleries rather than a raw share-link
 * log. No cap math lives here — the header count comes from
 * getPlanEntitlements (lib/plans.ts), the same source Billing uses. */

/** A row as listed by listStudioGrants (lib/shares/grants.ts). */
export type GalleryGrantRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  clientEmail: string;
  state: string;
  expiresAt: string | null;
  createdAt: string;
  allowDownload: boolean;
};

/** States that occupy no live tier slot — hidden by default on the overview. */
export const INACTIVE_GRANT_STATES: readonly string[] = ["revoked", "regenerated", "expired"];

export function isActiveGrantRow(grant: { state: string }): boolean {
  return !INACTIVE_GRANT_STATES.includes(grant.state);
}

export type ProjectGrantGroup = {
  projectId: string;
  projectTitle: string;
  grants: GalleryGrantRow[];
};

/** Group rows by project. Input is newest-first (listStudioGrants order);
 * groups keep that project order and each group's rows keep the input order. */
export function groupGrantsByProject(grants: GalleryGrantRow[]): ProjectGrantGroup[] {
  const groups = new Map<string, ProjectGrantGroup>();
  for (const grant of grants) {
    let group = groups.get(grant.projectId);
    if (!group) {
      group = { projectId: grant.projectId, projectTitle: grant.projectTitle, grants: [] };
      groups.set(grant.projectId, group);
    }
    group.grants.push(grant);
  }
  return [...groups.values()];
}
