import { redirect } from "next/navigation";

import { SettingsNotifications } from "@/components/settings-notifications";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings · Notifications" };

export default async function SettingsNotificationsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  // WEB-275: studio settings are admin+ (Security stays self-account).
  if (!can(ctx.role, "settings.read")) redirect("/dashboard");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");

  return (
    <SettingsNotifications
      notificationPrefs={profile.notificationPrefs ?? null}
      clientNotifyDefault={profile.clientNotifyDefault ?? true}
      inboxMirror={profile.inboxMirror ?? true}
      contactEmail={profile.contactEmail ?? null}
    />
  );
}
