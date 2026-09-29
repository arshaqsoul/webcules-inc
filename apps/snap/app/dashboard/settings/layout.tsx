import { redirect } from "next/navigation";

import { SettingsNav } from "@/components/settings-nav";
import { listDomains } from "@/lib/repos/domains";
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
  // Domains action-needed dot (WEB-229): any live domain in a trouble state.
  const domains = await listDomains(ctx.organizationId);
  const domainsNeedAttention = domains.some((d) =>
    ["degraded", "failed", "suspended_entitlement"].includes(d.status),
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Studio profile, branding, domains, and account configuration.
        </p>
      </div>
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <SettingsNav
          hints={{
            billing: <span className="text-[11px] capitalize text-ink-tertiary">{profile.plan}</span>,
            ...(domainsNeedAttention
              ? { domains: <span aria-label="needs attention" title="A domain needs attention" className="inline-block h-1.5 w-1.5 rounded-full bg-warning" /> }
              : {}),
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
