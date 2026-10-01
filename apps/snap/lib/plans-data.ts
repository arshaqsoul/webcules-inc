/* Pure plan data (WEB-256) — client-safe (no DB imports): the plan
 * table + planDef live here; lib/plans.ts re-exports them and keeps the
 * usage resolvers. */
export type PlanId = "free" | "lite" | "studio" | "pro";

export type PlanDef = {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  /** Included storage. */
  storageBytes: number;
  /** Hard upload lock (2× included) — beyond this, uploads are refused. */
  hardLockBytes: number;
  /** Overage: USD per GB-mo beyond the cap (billed, capped at next-tier delta). */
  overagePerGbUsd: number;
  /** Monthly PUT bound (2× cap) — adversarial churn ceiling. */
  monthlyUploadBytes: number;
  /** Per-org file ceiling (all tiers). */
  fileCap: number;
  jpgOnly: boolean;
  rawAllowed: boolean;
  /** Free-tier RAW trial pocket: RAW bytes permitted inside storageBytes
   * (kind='raw' assets; the pocket lets prospects feel the Vault — paid
   * tiers are unlimited via rawAllowed). null = no pocket on this tier. */
  rawTrialBytes: number | null;
  whiteLabel: boolean;
  maxActiveBookings: number | null;
  maxActiveGalleries: number | null;
  /** WEB-217 multi-studio: studios in the family incl. the parent (null =
   * unlimited). Non-negotiable condition: quotas POOL across the family. */
  maxLinkedStudios: number | null;
  /** WEB-224 custom domains: slots included with the plan (Pro 2, others 0 —
   * Studio buys one via the $5/mo add-on, read from addon_custom_domain). */
  maxCustomDomains: number;
  /** OTP emails per client per rolling 30d (enforced in gallery-auth). */
  otpCapPerUser: number;
  /** WEB-250 session types (HoneyBook ladder): null = unlimited. */
  maxSessionTypes: number | null;
  /** WEB-251 contract templates: null = unlimited (Free/Lite 2). */
  maxContractTemplates: number | null;
  /** WEB-253 email snippets: null = unlimited (Free/Lite 5). */
  maxEmailSnippets: number | null;
  /** WEB-256 contact forms (Free/Lite 1, Studio+ unlimited). */
  maxContactForms: number | null;
  /** WEB-256 questionnaires (Free 1, Lite 3, Studio+ unlimited). */
  maxQuestionnaires: number | null;
  /** WEB-275 team seats (members + pending invites) — Free 1 · Lite 1 ·
   * Studio 3 · Pro 10. Owner counts as one seat. */
  maxTeamSeats: number;
  /** WEB-309 inbox: snooze (Lite+ — the inbox itself is free-for-all by
   * design; it's the retention surface). */
  inboxSnooze: boolean;
};

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free", name: "Free", priceMonthlyUsd: 0,
    storageBytes: 20 * GB, hardLockBytes: 40 * GB, overagePerGbUsd: 0,
    monthlyUploadBytes: 40 * GB, fileCap: 250_000,
    jpgOnly: true, rawAllowed: false, rawTrialBytes: 3 * GB, whiteLabel: false,
    maxActiveBookings: null, maxActiveGalleries: 5, maxLinkedStudios: 1, otpCapPerUser: 30, maxSessionTypes: 1, maxContractTemplates: 2, maxEmailSnippets: 5, maxContactForms: 1, maxQuestionnaires: 1,
    maxCustomDomains: 0, maxTeamSeats: 1, inboxSnooze: false,
  },
  lite: {
    id: "lite", name: "Lite", priceMonthlyUsd: 15,
    storageBytes: 150 * GB, hardLockBytes: 300 * GB, overagePerGbUsd: 0,
    monthlyUploadBytes: 300 * GB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: false,
    maxActiveBookings: null, maxActiveGalleries: 15, maxLinkedStudios: 3, otpCapPerUser: 30, maxSessionTypes: 3, maxContractTemplates: 2, maxEmailSnippets: 5, maxContactForms: 1, maxQuestionnaires: 3,
    maxCustomDomains: 0, maxTeamSeats: 1, inboxSnooze: true,
  },
  studio: {
    id: "studio", name: "Studio", priceMonthlyUsd: 29,
    storageBytes: 500 * GB, hardLockBytes: TB, overagePerGbUsd: 0.1,
    monthlyUploadBytes: TB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: true,
    maxActiveBookings: null, maxActiveGalleries: null, maxLinkedStudios: null, otpCapPerUser: 30, maxSessionTypes: null, maxContractTemplates: null, maxEmailSnippets: null, maxContactForms: null, maxQuestionnaires: null,
    maxCustomDomains: 0, maxTeamSeats: 3, inboxSnooze: true,
  },
  pro: {
    id: "pro", name: "Pro", priceMonthlyUsd: 59,
    storageBytes: 2 * TB, hardLockBytes: 4 * TB, overagePerGbUsd: 0.1,
    monthlyUploadBytes: 4 * TB, fileCap: 250_000,
    jpgOnly: false, rawAllowed: true, rawTrialBytes: null, whiteLabel: true,
    maxActiveBookings: null, maxActiveGalleries: null, maxLinkedStudios: null, otpCapPerUser: 30, maxSessionTypes: null, maxContractTemplates: null, maxEmailSnippets: null, maxContactForms: null, maxQuestionnaires: null,
    maxCustomDomains: 2, maxTeamSeats: 10, inboxSnooze: true,
  },
};

export function planDef(plan: string | null | undefined): PlanDef {
  return PLANS[(plan ?? "free") as PlanId] ?? PLANS.free;
}

