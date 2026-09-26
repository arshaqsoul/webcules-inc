/* Dashboard shell — auth + studio guards live here so every child route is
 * protected by construction. Redirects: /login (no session), /onboarding (no
 * studio profile yet). */
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { getPlanEntitlements } from "@/lib/plans";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { DormancyBanner } from "@/components/dormancy-banner";
import { ConfirmProvider } from "@/components/confirm-provider";
import { DashboardNavLinks } from "@/components/dashboard-nav";
import { MobileNav } from "@/components/mobile-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");

  // WEB-150: persistent usage banner at ≥90% of plan storage / hard lock.
  const ent = await getPlanEntitlements(ctx.organizationId);
  const usageBanner =
    ent && (ent.atHardLock || ent.storagePct >= 90)
      ? ent.atHardLock
        ? "Uploads are locked — you've reached 2× your plan storage. Galleries and downloads keep working."
        : `Storage at ${ent.storagePct}% of your ${ent.name} plan — uploads lock at 2× your cap.`
      : null;

  // WEB-159: cold-storage banner for returning dormant studios.
  const { getDormancyBanner } = await import("@/lib/dormancy");
  const dormancy = await getDormancyBanner(ctx.organizationId);

  return (
    <ConfirmProvider>
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-surface-1 md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-hairline px-4">
          <span aria-hidden className="inline-block h-4 w-4 rounded-[4px] bg-primary" />
          <span className="truncate text-sm font-medium text-ink">{profile.studioName}</span>
        </div>
        <DashboardNavLinks />
        <div className="flex flex-col gap-0.5 border-t border-hairline p-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-hairline px-4 md:hidden">
          <MobileNav studioName={profile.studioName} />
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-ink">{profile.studioName}</span>
          <SignOutButton compact />
        </header>
        {usageBanner && (
          <div className={`flex flex-wrap items-center gap-2 px-6 py-2 text-xs ${ent?.atHardLock ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
            <span className="flex-1">{usageBanner}</span>
            <Link href="/dashboard/settings" className="font-medium underline underline-offset-2">
              Review plan
            </Link>
          </div>
        )}
        {dormancy && (
          <div className="border-b border-hairline bg-surface px-6 py-2.5">
            <DormancyBanner kind={dormancy.kind} objects={dormancy.objects} />
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
    </ConfirmProvider>
  );
}
