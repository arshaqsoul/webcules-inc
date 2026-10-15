/* Page builder skeleton — mirrors the gallery builder shell: a top bar
 * with title + actions, then the asset grid of uniform tiles. */
export default function BuilderLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading page builder">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-7 w-56 animate-pulse rounded-md bg-surface-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-md bg-surface-2" />
          <div className="h-8 w-24 animate-pulse rounded-md bg-surface-2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-lg border border-hairline bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
