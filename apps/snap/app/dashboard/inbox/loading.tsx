/* Inbox skeleton — mirrors InboxView's two-pane layout: the conversation
 * list card on the left (avatar + name + preview rows) and the thread pane
 * on the right with message bubbles and the composer. */
export default function InboxLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" aria-busy="true" aria-label="Loading inbox">
      <div className="grid min-h-0 flex-1 gap-4 lg:gap-0 lg:grid-cols-[360px_6px_minmax(0,1fr)]">
        <div className="flex min-h-64 flex-col overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
          <div className="border-b border-hairline px-4 py-3">
            <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
          </div>
          <div className="flex flex-1 flex-col">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-44 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden lg:flex" aria-hidden />
        <div className="flex min-h-96 flex-col overflow-hidden rounded-[12px] border border-hairline bg-background">
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3.5 w-36 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex justify-start">
              <div className="h-16 w-[60%] animate-pulse rounded-[12px] border border-hairline bg-surface-1" />
            </div>
            <div className="flex justify-end">
              <div className="h-12 w-[45%] animate-pulse rounded-[12px] bg-surface-2" />
            </div>
            <div className="flex justify-start">
              <div className="h-12 w-[55%] animate-pulse rounded-[12px] border border-hairline bg-surface-1" />
            </div>
          </div>
          <div className="border-t border-hairline p-3">
            <div className="h-16 w-full animate-pulse rounded-md bg-surface-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
