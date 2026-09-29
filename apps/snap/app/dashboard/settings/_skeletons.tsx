/* Shared skeleton primitives for the settings sections — each route's
 * loading.tsx composes these to mirror its real content's sizing (card
 * heights, field grids, chips) so streaming in never shifts layout. Private
 * file: the underscore prefix keeps it out of routing. */

export function SkeletonHeader() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-8 w-28 animate-pulse rounded-md bg-surface-2" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-surface-2" />
    </div>
  );
}

export function SkeletonCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[12px] border border-hairline bg-surface-1 p-5 ${className}`}>{children}</section>
  );
}

export function SkeletonCardTitle() {
  return <div className="h-4 w-36 animate-pulse rounded bg-surface-2" />;
}

export function SkeletonFields({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-9 w-full animate-pulse rounded-md bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-3.5 animate-pulse rounded bg-surface-2 ${className}`} />;
}
