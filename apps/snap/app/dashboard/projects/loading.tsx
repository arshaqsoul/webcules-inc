/* Projects skeleton — mirrors the kanban board: heading row, then the
 * horizontally-scrolling status columns with uniform project cards. */
export default function ProjectsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5" aria-busy="true" aria-label="Loading projects">
      <div>
        <div className="h-7 w-24 animate-pulse rounded-md bg-surface-2" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="-mx-6 flex min-h-0 flex-1 gap-3 overflow-hidden px-6">
        {[0, 1, 2, 3].map((col) => (
          <div key={col} className="flex w-[272px] shrink-0 flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3 md:w-[300px]">
            <div className="flex items-center justify-between px-1">
              <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-6 animate-pulse rounded-full bg-surface-2" />
            </div>
            {[0, 1, 2].map((card) => (
              <div key={card} className="h-[76px] animate-pulse rounded-lg border border-hairline bg-background" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
