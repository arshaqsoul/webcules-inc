/* Project detail skeleton — mirrors the project page: back link, header
 * with status dot + actions, tab pills, then the Details and Notes cards. */
export default function ProjectDetailLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading project">
      <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-surface-2" />
            <div className="h-7 w-48 animate-pulse rounded-md bg-surface-2" />
          </div>
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-8 w-28 animate-pulse rounded-md bg-surface-2" />
          <div className="h-8 w-36 animate-pulse rounded-md bg-surface-2" />
        </div>
      </div>
      <div className="flex gap-1.5">
        {[64, 80, 72, 56, 88].map((w, i) => (
          <div key={i} className="h-7 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
        ))}
      </div>
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="h-4 w-14 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-3.5 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-2" />
        </div>
      </section>
    </div>
  );
}
