"use client";

/* Mobile navigation drawer (WEB-171) — the Sheet from packages/ui, opening
 * from the hamburger in the mobile header. Closes on navigation; ESC and
 * backdrop-close come from Radix; body scroll-lock is Radix default. */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@webcules/ui/components/sheet";

import { DashboardNavLinks } from "@/components/dashboard-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";

export function MobileNav({ studioName }: { studioName: string }) {
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
        <div className="flex h-14 items-center gap-2 border-b border-hairline px-4">
          <span aria-hidden className="inline-block h-4 w-4 rounded-[4px] bg-primary" />
          <span className="truncate text-sm font-medium text-ink">{studioName}</span>
        </div>
        <DashboardNavLinks />
        <div className="flex flex-col gap-0.5 border-t border-hairline p-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
