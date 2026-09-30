"use client";

/* Dashboard sidebar shell (desktop, WEB-217 era) — owns the collapse state.
 * Expanded: 240px with the studio switcher + labeled rows. Collapsed: a 56px
 * icon rail (tooltips carry the labels) — clicking the studio block expands
 * it back up, per the Linear-style interaction. State persists in
 * localStorage (same mount-effect pattern as grid density).
 * WEB-270: hosts the setup-guide progress card (expanded sidebar, until the
 * checklist completes or the studio hides it) and its reopen affordance. */
import { useEffect, useState } from "react";
import { BookOpen, ListChecks, PanelLeftClose } from "lucide-react";

import { Button } from "@webcules/ui/components/button";

import { DashboardNavLinks } from "@/components/dashboard-nav";
import { SetupGuideCard, type SetupStepView } from "@/components/setup-guide-card";
import { SignOutButton } from "@/components/sign-out-button";
import { StudioSwitcher, type SwitcherStudio } from "@/components/studio-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { SnapMark } from "@/components/snap-mark";

export function DashboardSidebar({
  studios,
  currentOrganizationId,
  rootOrganizationId,
  familyStudioCount,
  maxLinkedStudios,
  setup,
  setupReopenable,
}: {
  studios: SwitcherStudio[];
  currentOrganizationId: string;
  rootOrganizationId: string;
  familyStudioCount: number;
  maxLinkedStudios: number | null;
  /** WEB-270: server-derived checklist for the ACTIVE studio (null = hidden
   * — dismissed or complete). Per-org by construction: the layout resolves
   * it against the active org on every render. */
  setup: { steps: SetupStepView[]; done: number; total: number } | null;
  setupReopenable: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("snap-sidebar") === "1") setCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("snap-sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-hairline bg-surface-1 transition-[width] duration-200 md:flex ${collapsed ? "w-14" : "w-60"}`}
    >
      <div className={`flex h-14 shrink-0 items-center border-b border-hairline ${collapsed ? "justify-center px-2" : "gap-1 px-3"}`}>
        {collapsed ? (
          /* Collapsed: the studio block IS the expand trigger. */
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="flex h-9 w-full items-center justify-center rounded-md transition-colors hover:bg-surface-2"
          >
            <SnapMark className="h-4 w-4 rounded-[5px]" />
          </button>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <StudioSwitcher
                studios={studios}
                currentOrganizationId={currentOrganizationId}
                rootOrganizationId={rootOrganizationId}
                familyStudioCount={familyStudioCount}
                maxLinkedStudios={maxLinkedStudios}
              />
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="shrink-0 rounded-md p-1.5 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </div>

      <DashboardNavLinks includeDocs={false} collapsed={collapsed} onExpandSidebar={() => setCollapsed(false)} />

      {/* WEB-270: setup progress card — expanded sidebar only (the rail keeps
       * its icon density); auto-hides at 10/10 or dismissal via `setup`
       * being null from the layout. */}
      {!collapsed && setup && (
        <SetupGuideCard steps={setup.steps} done={setup.done} total={setup.total} variant="card" />
      )}

      <div className={`mt-auto flex flex-col gap-0.5 border-t border-hairline ${collapsed ? "px-1.5 py-2" : "p-2"}`}>
        {collapsed ? (
          <>
            <a
              href="/docs/embeds"
              target="_blank"
              rel="noreferrer"
              title="Docs"
              aria-label="Docs"
              className="flex h-8 w-full items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <BookOpen className="h-4 w-4" aria-hidden />
            </a>
            <ThemeToggle iconOnly />
            <SignOutButton iconOnly />
          </>
        ) : (
          <>
            {setupReopenable && <ReopenSetupButton />}
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
          </>
        )}
      </div>
    </aside>
  );
}

/** Shown when the guide was dismissed before finishing — the reopen path
 * (WEB-270 "reopenable from Help"). */
function ReopenSetupButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch("/api/studio/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reopen" }),
        })
          .catch(() => {})
          .finally(() => window.location.reload());
      }}
    >
      <ListChecks className="h-4 w-4 shrink-0" aria-hidden />
      <span className="ml-2.5">Setup guide</span>
    </Button>
  );
}
