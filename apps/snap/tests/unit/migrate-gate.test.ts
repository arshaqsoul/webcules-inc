import { describe, expect, it } from "vitest";
import { computePending, orphanedLedgerRows, TARGETS } from "@/scripts/migrate-core.mjs";

/* WEB-468 — the deploy-refusal math. Prod 500'd because deploys only checked
 * "the latest migration looks applied"; these tests pin the stricter rule:
 * a migration is applied ONLY as an exact ledger row, and ANY missing file
 * (a middle one like 0074, not just the tail) is pending. */

const FILES = [
  "0001_init.sql",
  "0073_integration_publish.sql",
  "0074_mid_derivative.sql",
  "0075_email_capture.sql",
];

describe("computePending (D1 migrations ledger gate)", () => {
  it("empty ledger: everything pending, in file order", () => {
    expect(computePending(FILES, new Set())).toEqual(FILES);
  });

  it("complete ledger: nothing pending", () => {
    expect(computePending(FILES, new Set(FILES))).toEqual([]);
  });

  it("a MIDDLE migration missing from the ledger is pending (the 0074 incident shape)", () => {
    const ledger = new Set(FILES.filter((f) => f !== "0074_mid_derivative.sql"));
    expect(computePending(FILES, ledger)).toEqual(["0074_mid_derivative.sql"]);
  });

  it("gap in the middle AND the tail: both reported", () => {
    const ledger = new Set(["0001_init.sql", "0073_integration_publish.sql"]);
    expect(computePending(FILES, ledger)).toEqual(["0074_mid_derivative.sql", "0075_email_capture.sql"]);
  });

  it("ledger rows that do not match a file name exactly do not count as applied", () => {
    // e.g. someone recorded a renamed/typo'd name
    const ledger = new Set(["0001_init.sql", "0073_integration_publish", "0074_mid_derivative.sqlx", "0075_email_capture.sql"]);
    expect(computePending(FILES, ledger)).toEqual(["0073_integration_publish.sql", "0074_mid_derivative.sql"]);
  });

  it("accepts arrays as well as Sets", () => {
    expect(computePending(FILES, ["0001_init.sql", "0073_integration_publish.sql", "0074_mid_derivative.sql", "0075_email_capture.sql"])).toEqual([]);
  });
});

describe("orphanedLedgerRows", () => {
  it("flags ledger rows with no backing file (renames/deletes to investigate)", () => {
    const ledger = new Set([...FILES, "0099_gone.sql"]);
    expect(orphanedLedgerRows(FILES, ledger)).toEqual(["0099_gone.sql"]);
  });
});

describe("TARGETS", () => {
  it("maps deploy targets to the right remote D1 databases", () => {
    expect(TARGETS.staging).toBe("webcules-snap-staging");
    expect(TARGETS.production).toBe("webcules-snap");
    expect((TARGETS as Record<string, string | undefined>).local).toBeUndefined();
  });
});
