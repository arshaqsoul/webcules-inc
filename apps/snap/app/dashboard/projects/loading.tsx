/* Kanban board skeleton — column shells with card placeholders. */
export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading projects">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((col) => (
          <div key={col} className="flex min-w-[220px] flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3">
            <div className="flex items-center justify-between px-1">
              <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-6 animate-pulse rounded-full bg-surface-2" />
            </div>
            {[0, 1].map((card) => (
              <div key={card} className="h-[76px] animate-pulse rounded-lg border border-hairline bg-background" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
