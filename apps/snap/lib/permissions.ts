/* WEB-275 Team & roles — the single permission gate for studio staff.
 *
 * Roles (Better Auth organization defaults):
 *   owner  — everything, exactly one per org (billing, payouts, deletion)
 *   admin  — studio manager: everything except billing/payouts
 *   member — second shooter / assistant: day-to-day work, no money surfaces,
 *            no settings, no RAW vault unless the org toggles it on
 *
 * Enforcement lives at the API boundary and in server pages (redirects).
 * Existing solo studios are owner-role → every gate passes (zero-diff).
 * Client transactional surfaces (portal, gallery OTP, contract signing) are
 * untouched — these gates govern STUDIO staff actions only. */
import type { OrgContext } from "./session";

export type Role = "owner" | "admin" | "member";

export type Permission =
  | "settings.read" // every /dashboard/settings/* surface
  | "settings.write" // brand/domains/embeds/delivery/notifications writes
  | "billing.read" // transactions ledger
  | "billing.write" // plan checkout/portal + payouts
  | "documents.manage" // contracts + invoices create/send
  | "team.manage" // invites, role changes, removals
  | "rawvault.read" // RAW vault (members also need the per-org toggle)
  | "work.manage" // leads, bookings, uploads, files, galleries
  | "analytics.read";

const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

/** Matrix from WEB-275: which minimum role passes each permission. */
const MIN_ROLE: Record<Permission, Role> = {
  "settings.read": "admin",
  "settings.write": "admin",
  "billing.read": "owner",
  "billing.write": "owner",
  "documents.manage": "admin",
  "team.manage": "admin",
  "rawvault.read": "admin", // member access resolves via the org toggle at the call site
  "work.manage": "member",
  "analytics.read": "member",
};

export function normalizeRole(role: string | null | undefined): Role {
  return role === "owner" || role === "admin" ? role : "member";
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  const r = normalizeRole(role);
  return ROLE_RANK[r] >= ROLE_RANK[MIN_ROLE[permission]];
}

/** RAW vault: admins always; members only when the org toggles them in
 * (studio_profiles.member_raw_access, off by default). */
export function canAccessRawVault(role: string | null | undefined, memberRawAccess: boolean): boolean {
  if (can(role, "rawvault.read")) return true;
  return normalizeRole(role) === "member" && memberRawAccess;
}

/** Org-context convenience for API routes: passes → null, fails → a 403
 * Response the route can return directly. */
export function permissionDenied(ctx: OrgContext, permission: Permission): Response | null {
  if (can(ctx.role, permission)) return null;
  return Response.json(
    {
      error: "forbidden",
      message: `Your ${normalizeRole(ctx.role)} role doesn't allow this — ask a studio admin.`,
      permission,
    },
    { status: 403 },
  );
}
