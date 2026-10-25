"use client";

/* Galleries overview list (WEBC-115) — grouped per project, dead links
 * (revoked / regenerated / expired) collapsed behind a "Show inactive"
 * toggle that is OFF by default. Pure presentation: the data is shaped in
 * lib/galleries-overview.ts and fetched in the server page. */
import Link from "next/link";
import { useMemo, useState } from "react";

import { groupGrantsByProject, isActiveGrantRow, type GalleryGrantRow } from "@/lib/galleries-overview";

const STATE_TONE: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  scheduled: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  expiring_soon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expired: "bg-surface-2 text-ink-tertiary",
  revoked: "bg-destructive/10 text-destructive",
  regenerated: "bg-surface-2 text-ink-tertiary",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function GrantRows({ grants }: { grants: GalleryGrantRow[] }) {
  return (
    <tbody className="divide-y divide-hairline">
      {grants.map((g) => (
        <tr key={g.id}>
          <td className="max-w-52 truncate px-4 py-3 text-ink-muted">{g.clientEmail}</td>
          <td className="px-4 py-3 text-ink-muted">{fmtDate(g.createdAt)}</td>
          <td className="px-4 py-3 text-ink-muted">{g.expiresAt ? fmtDate(g.expiresAt) : "No expiry"}</td>
          <td className="px-4 py-3">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[g.state] ?? ""}`}>
              {g.state.replace("_", " ")}
            </span>
          </td>
          <td className="px-4 py-3 text-right">
            <Link
              href={`/dashboard/projects/${g.projectId}?tab=gallery`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open project gallery
            </Link>
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export function GalleriesView({ grants }: { grants: GalleryGrantRow[] }) {
  const [showInactive, setShowInactive] = useState(false);

  const { groups, inactiveCount } = useMemo(() => {
    const all = groupGrantsByProject(grants);
    let inactive = 0;
    const visible = all
      .map((group) => {
        const rows = showInactive ? group.grants : group.grants.filter(isActiveGrantRow);
        inactive += group.grants.length - group.grants.filter(isActiveGrantRow).length;
        return { ...group, grants: rows };
      })
      .filter((group) => group.grants.length > 0);
    return { groups: visible, inactiveCount: inactive };
  }, [grants, showInactive]);

  if (grants.length === 0) {
    return (
      <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
        <p className="p-8 text-center text-sm text-ink-subtle">
          No galleries shared yet — open a project and share its approved files.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {inactiveCount > 0 && (
        <div>
          <button
            type="button"
            aria-pressed={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-1 hover:text-ink"
          >
            {showInactive ? "Hide inactive" : `Show inactive (${inactiveCount})`}
          </button>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.projectId} data-testid="gallery-project-group" className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <Link
              href={`/dashboard/projects/${group.projectId}`}
              className="text-sm font-medium text-ink hover:underline"
            >
              {group.projectTitle}
            </Link>
            <span className="text-xs text-ink-tertiary">
              {group.grants.length} link{group.grants.length === 1 ? "" : "s"}
            </span>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-tertiary">
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Gallery</th>
              </tr>
            </thead>
            <GrantRows grants={group.grants} />
          </table>
        </section>
      ))}
    </div>
  );
}
