/* Unit costs as code (WEB-161) — the single source the margin report and
 * threshold alerts compute against.
 *
 * Source of truth: Linear doc "Unit Economics — Cloudflare Cost Model
 * (Sept 2026)" (verified 2026-09-25). QUARTERLY RE-CHECK TASK (owned by this
 * file): Email Service is beta — re-verify $0.35/1k + the 3k allowance each
 * quarter and bump UNIT_COSTS.version here + the doc together.
 *
 * Email-shock contingency toggle: GALLERY_OTP_MODE (wrangler var) — "off"
 * stops gallery OTP emails entirely; the margin report surfaces its current
 * state so the founder can see the lever that guards the 3k allowance. */
export const UNIT_COSTS = {
  version: "2026-09-25",
  /** R2 Standard, billed on total stored − 10GB (account-wide free tier). */
  storagePerGbMo: 0.015,
  r2IaStoragePerGbMo: 0.01,
  /** R2 IA retrieval (RAW vault restores) — absorbed by the platform. */
  r2IaRetrievalPerGb: 0.01,
  r2ClassAPerM: 4.5,
  r2ClassBPerM: 0.36,
  workerRequestsPerM: 0.3,
  /** Doc key number: one image view (Worker + R2 GET) = $0.66/M. */
  imageViewPerM: 0.66,
  /** Email Service beta: 3k/mo included, $0.35/1k after. */
  emailPerK: 0.35,
  emailMonthlyAllowance: 3000,
  /** Alert when an org's monthly COGS exceeds this share of its plan price. */
  cogsAlertShareOfPlan: 0.5,
  /** Alert when account-wide sent email passes this share of the allowance. */
  emailAlertShareOfAllowance: 0.5,
} as const;

export type OrgUsage = {
  storedBytes: number;
  imageViews: number;
  emailsSent: number;
  uploadOps: number;
};

export type CogsBreakdown = {
  storageUsd: number;
  viewsUsd: number;
  emailsUsd: number;
  uploadsUsd: number;
  totalUsd: number;
};

/** Per-org monthly COGS from usage. Storage dominates by design (97–98.5%
 * of per-studio cost per the doc); views/emails/uploads are the guardrails. */
export function orgMonthlyCogs(u: OrgUsage): CogsBreakdown {
  const storageUsd = (u.storedBytes / 1024 ** 3) * UNIT_COSTS.storagePerGbMo;
  const viewsUsd = (u.imageViews / 1e6) * UNIT_COSTS.imageViewPerM;
  const emailsUsd = (u.emailsSent / 1e3) * UNIT_COSTS.emailPerK;
  const uploadsUsd = (u.uploadOps / 1e6) * UNIT_COSTS.r2ClassAPerM;
  return {
    storageUsd,
    viewsUsd,
    emailsUsd,
    uploadsUsd,
    totalUsd: storageUsd + viewsUsd + emailsUsd + uploadsUsd,
  };
}

export function usdCents(v: number): number {
  return Math.round(v * 100);
}
