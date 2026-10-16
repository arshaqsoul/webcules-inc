/* Pure helpers for the D1 migration ledger (WEB-468) — unit-tested in
 * tests/unit/migrate-gate.test.ts. Keep this module side-effect free. */

/** Remote D1 database per deploy target (single source for migrate.mjs + deploy.mjs). */
export const TARGETS = {
  staging: "webcules-snap-staging",
  production: "webcules-snap",
};

/**
 * Which migration files are NOT yet on the ledger, in file order.
 * A migration counts as applied only when its exact file name is a ledger row.
 * Files are applied in lexicographic order (the repo's 00NN_ prefix keeps that
 * the authoring order); a gap never silently passes — anything missing shows
 * up in the result, not just the tail.
 */
export function computePending(files, appliedSet) {
  const applied = appliedSet instanceof Set ? appliedSet : new Set(appliedSet);
  return files.filter((f) => !applied.has(f));
}

/** Ledger rows that reference files no longer in migrations/ (renames/deletes). */
export function orphanedLedgerRows(files, appliedSet) {
  const known = new Set(files);
  const applied = appliedSet instanceof Set ? appliedSet : new Set(appliedSet);
  return [...applied].filter((n) => !known.has(n)).sort();
}
