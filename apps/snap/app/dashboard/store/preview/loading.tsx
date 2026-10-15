/* Store preview skeleton — mirrors the public preview shell: studio
 * eyebrow + name on the max-w-3xl column, then the 2-col product grid. */
export default function StorePreviewLoading() {
  return (
    <div className="min-h-screen bg-canvas pb-20" aria-busy="true" aria-label="Loading store preview">
      <div className="mx-auto max-w-3xl px-4 pt-10">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
        <div className="mt-1 h-7 w-56 max-w-full animate-pulse rounded-md bg-surface-2" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface px-4 py-4">
              <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-surface-2" />
              <div className="flex items-baseline justify-between gap-2">
                <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
                <div className="h-4 w-14 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="mt-auto h-9 w-full animate-pulse rounded-md bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
