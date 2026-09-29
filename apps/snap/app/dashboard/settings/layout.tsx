import { redirect } from "next/navigation";

import { SettingsNav } from "@/components/settings-nav";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

/* Settings shell (WEB-234/235) — auth + profile guards live here once for
 * every section route; each page below loads only its own data. */
export const metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Studio profile, branding, domains, and account configuration.
        </p>
      </div>
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <SettingsNav hints={{ billing: <span className="text-[11px] capitalize text-ink-tertiary">{profile.plan}</span> }} />
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
