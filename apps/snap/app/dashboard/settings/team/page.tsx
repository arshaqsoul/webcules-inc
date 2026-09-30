import { redirect } from "next/navigation";

import { SettingsTeam } from "@/components/settings-team";
import { getPlanEntitlements } from "@/lib/plans";
import { can, normalizeRole } from "@/lib/permissions";
import { listPendingInvites, listTeamMembers } from "@/lib/repos/team";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Team" };

export default async function SettingsTeamPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");
  // WEB-275: the whole settings tree is admin+.
  if (!can(ctx.role, "settings.read")) redirect("/dashboard");

  const myRole = normalizeRole(ctx.role);
  const [members, invites, ent] = await Promise.all([
    listTeamMembers(ctx.organizationId),
    listPendingInvites(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
  ]);
  const seatsTotal = ent?.maxTeamSeats ?? 1;
  const seatsUsed = members.length + invites.length;

  return (
    <SettingsTeam
      members={members.map((m) => ({
        memberId: m.memberId,
        name: m.name,
        email: m.email,
        role: m.role,
        isYou: m.userId === ctx.user.id,
      }))}
      invites={invites}
      seatsUsed={seatsUsed}
      seatsTotal={seatsTotal}
      planName={ent?.name ?? "Free"}
      myRole={myRole}
      memberRawAccess={profile.memberRawAccess ?? false}
    />
  );
}
