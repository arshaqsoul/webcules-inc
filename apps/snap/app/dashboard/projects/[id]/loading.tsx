/* Project detail skeleton — header + stacked section blocks. */
export default function ProjectLoading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5" aria-busy="true" aria-label="Loading project">
      <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-72 animate-pulse rounded-md bg-surface-2" />
          <div className="h-4 w-52 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-7 w-28 animate-pulse rounded-full bg-surface-2" />
      </div>
      {[0, 1, 2].map((s) => (
        <div key={s} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 h-24 animate-pulse rounded-md bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
