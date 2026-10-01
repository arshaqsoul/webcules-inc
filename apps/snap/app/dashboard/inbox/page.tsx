/* /dashboard/inbox (WEB-305) — the unified conversation surface. The list,
 * thread timeline and composer all fetch client-side (SWR rhythm); this
 * server shell only gates auth and hands the composer its studio context
 * (contact email for the mirror toggle, studio name for outbound bubbles). */
import { redirect } from "next/navigation";

import { InboxView } from "@/components/inbox/inbox-view";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");

  return (
    <InboxView
      contactEmail={profile.contactEmail}
      studioName={profile.studioName}
    />
  );
}
