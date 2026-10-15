/* Shared skeleton primitives for the dashboard routes — each route's
 * loading.tsx composes these to mirror its real content's sizing (headers,
 * stat cards, tab pills, table rows) so streaming in never shifts layout.
 * Private file: the underscore prefix keeps it out of routing. */

export function SkeletonPageHeader({ titleW = "w-32", subW = "w-72" }: { titleW?: string; subW?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`h-7 ${titleW} animate-pulse rounded-md bg-surface-2`} />
      <div className={`h-4 ${subW} max-w-full animate-pulse rounded bg-surface-2`} />
    </div>
  );
}

export function SkeletonCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[12px] border border-hairline bg-surface-1 p-5 ${className}`}>{children}</section>;
}

export function SkeletonCardTitle({ className = "w-36" }: { className?: string }) {
  return <div className={`h-4 ${className} animate-pulse rounded bg-surface-2`} />;
}

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-3.5 animate-pulse rounded bg-surface-2 ${className}`} />;
}

export function SkeletonPills({ widths = [72, 88, 64, 96] }: { widths?: number[] }) {
  return (
    <div className="flex gap-1.5">
      {widths.map((w, i) => (
        <div key={i} className="h-7 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ cols, rows = 5, firstColW = "w-44" }: { cols: number; rows?: number; firstColW?: string }) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
      <div className="flex gap-4 border-b border-hairline px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className={`h-3 ${i === 0 ? firstColW.replace("44", "14") : "w-14"} animate-pulse rounded bg-surface-2`} />
        ))}
      </div>
      <div className="divide-y divide-hairline">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: cols }, (_, i) => (
              <div
                key={i}
                className={`h-4 ${i === 0 ? firstColW : i === cols - 1 ? "ml-auto w-16" : "w-20"} animate-pulse rounded bg-surface-2`}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
