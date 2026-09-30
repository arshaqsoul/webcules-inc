/* Dashboard shell — auth + studio guards live here so every child route is
 * protected by construction. Redirects: /login (no session), /onboarding (no
 * studio profile yet). */
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOrgContext } from "@/lib/session";
import { getStudioProfile, listUserStudios } from "@/lib/repos/studios";
import { getPlanEntitlements } from "@/lib/plans";
import { SignOutButton } from "@/components/sign-out-button";
import { DormancyBanner } from "@/components/dormancy-banner";
import { ConfirmProvider } from "@/components/confirm-provider";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
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

  // WEB-217: studio family — the switcher (and its add/link affordances).
  const studios = await listUserStudios(ctx.user.id);

  // WEB-159: cold-storage banner for returning dormant studios.
  const { getDormancyBanner } = await import("@/lib/dormancy");
  const dormancy = await getDormancyBanner(ctx.organizationId);

  // WEB-270: setup guide — always derived for the ACTIVE studio; hidden
  // (null) once dismissed or complete, reopenable while unfinished.
  const { getSetupState } = await import("@/lib/repos/setup");
  const setupState = await getSetupState(ctx.organizationId);
  const setupVisible = !setupState.dismissed && setupState.done < setupState.total;

  return (
    <ConfirmProvider>
    <div className="flex min-h-screen">
      <DashboardSidebar
        studios={studios}
        currentOrganizationId={ctx.organizationId}
        rootOrganizationId={ent?.rootOrganizationId ?? ctx.organizationId}
        familyStudioCount={ent?.familyStudioCount ?? 1}
        maxLinkedStudios={ent?.maxLinkedStudios ?? 1}
        plan={ent?.id ?? "free"}
        setup={
          setupVisible
            ? {
                steps: setupState.steps.map((s) => ({ id: s.id, title: s.title, why: s.why, href: s.href, done: s.done })),
                done: setupState.done,
                total: setupState.total,
              }
            : null
        }
        setupReopenable={setupState.dismissed && setupState.done < setupState.total}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-hairline px-4 md:hidden">
          <MobileNav
            studios={studios}
            currentOrganizationId={ctx.organizationId}
            rootOrganizationId={ent?.rootOrganizationId ?? ctx.organizationId}
            familyStudioCount={ent?.familyStudioCount ?? 1}
            maxLinkedStudios={ent?.maxLinkedStudios ?? 1}
            plan={ent?.id ?? "free"}
          />
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
        {/* Flex column so page roots (flex-1) can fill the viewport height;
         * [&>*]:min-w-0 keeps children shrinkable like block layout — without
         * it a wide child forces main wider than the viewport. */}
        <main className="flex flex-1 flex-col p-6 [&>*]:min-w-0">{children}</main>
      </div>
    </div>
    </ConfirmProvider>
  );
}
