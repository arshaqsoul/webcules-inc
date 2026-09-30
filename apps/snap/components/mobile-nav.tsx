"use client";

/* Mobile navigation drawer (WEB-171) — the Sheet from packages/ui, opening
 * from the hamburger in the mobile header. Closes on navigation; ESC and
 * backdrop-close come from Radix; body scroll-lock is Radix default. The
 * drawer header carries the same studio switcher as the desktop sidebar. */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@webcules/ui/components/sheet";

import { DashboardNavLinks } from "@/components/dashboard-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { StudioSwitcher, type SwitcherStudio } from "@/components/studio-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export function MobileNav({
  studios,
  currentOrganizationId,
  rootOrganizationId,
  familyStudioCount,
  maxLinkedStudios,
  plan = "free",
  role = "owner",
}: {
  studios: SwitcherStudio[];
  currentOrganizationId: string;
  rootOrganizationId: string;
  familyStudioCount: number;
  maxLinkedStudios: number | null;
  /** WEB-286: gates nav rows whose `requires` exceeds the plan. */
  plan?: "free" | "lite" | "studio" | "pro";
  /** WEB-275: staff role — drives the nav's role filtering. */
  role?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false); // close on navigation
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="rounded-md p-2 text-ink-subtle hover:text-ink md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 items-center border-b border-hairline px-3">
          <div className="min-w-0 flex-1">
            <StudioSwitcher
              studios={studios}
              currentOrganizationId={currentOrganizationId}
              rootOrganizationId={rootOrganizationId}
              familyStudioCount={familyStudioCount}
              maxLinkedStudios={maxLinkedStudios}
            />
          </div>
        </div>
        <DashboardNavLinks plan={plan} role={role} />
        <div className="flex flex-col gap-0.5 border-t border-hairline p-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
