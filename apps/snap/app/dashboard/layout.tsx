/* Dashboard shell — auth + studio guards live here so every child route is
 * protected by construction. Redirects: /login (no session), /onboarding (no
 * studio profile yet). */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";

import { getOrgContext } from "@/lib/session";
import { getStudioProfile, listUserStudios } from "@/lib/repos/studios";
import { getPlanEntitlements } from "@/lib/plans";
import { Button } from "@webcules/ui/components/button";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { DormancyBanner } from "@/components/dormancy-banner";
import { ConfirmProvider } from "@/components/confirm-provider";
import { DashboardNavLinks } from "@/components/dashboard-nav";
import { MobileNav } from "@/components/mobile-nav";
import { StudioSwitcher } from "@/components/studio-switcher";

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

  return (
    <ConfirmProvider>
    <div className="flex min-h-screen">
      {/* Viewport-pinned sidebar: sticky + h-dvh keeps it from stretching with
       * the content column, so the theme/logout block stays on screen while
       * long pages scroll; the nav scrolls internally on short viewports. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-hairline bg-surface-1 md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-hairline px-3">
          <StudioSwitcher
            studios={studios}
            currentOrganizationId={ctx.organizationId}
            rootOrganizationId={ent?.rootOrganizationId ?? ctx.organizationId}
            familyStudioCount={ent?.familyStudioCount ?? 1}
            maxLinkedStudios={ent?.maxLinkedStudios ?? 1}
          />
        </div>
        <DashboardNavLinks includeDocs={false} />
        <div className="mt-auto flex flex-col gap-0.5 border-t border-hairline p-2">
          {/* Docs opens beside the app (external tab) — kept in the bottom
           * utility group, above theme/logout, out of the studio nav. Same
           * ghost button styles so the group aligns and reads identically. */}
          <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
            <a href="/docs/embeds" target="_blank" rel="noreferrer">
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
              <span className="ml-2.5">Docs</span>
            </a>
          </Button>
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
        {/* Flex column so page roots (flex-1) can fill the viewport height;
         * [&>*]:min-w-0 keeps children shrinkable like block layout — without
         * it a wide child forces main wider than the viewport. */}
        <main className="flex flex-1 flex-col p-6 [&>*]:min-w-0">{children}</main>
      </div>
    </div>
    </ConfirmProvider>
  );
}
