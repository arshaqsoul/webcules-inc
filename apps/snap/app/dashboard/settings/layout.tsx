import { redirect } from "next/navigation";

import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

/* Settings shell (WEB-234) — auth + profile guards live here once for every
 * section route. Section navigation lives in the MAIN dashboard nav (the
 * collapsible Settings group in dashboard-nav.tsx); these pages render
 * content only, full width like the other dashboard surfaces (main owns the
 * padding). */
export const metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Studio profile, branding, domains, and account configuration.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
