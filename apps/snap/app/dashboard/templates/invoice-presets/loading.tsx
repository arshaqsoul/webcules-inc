/* Invoice presets skeleton — mirrors the section page: heading with the
 * create action, then the preset list card. */
export default function InvoicePresetsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading invoice presets">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-44 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-background px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-7 w-16 shrink-0 animate-pulse rounded-md bg-surface-2" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
