/* /dashboard/templates is an instant redirect hub (WEB-286) — this only
 * covers the brief navigation pause before the target section's own
 * skeleton takes over. */
export default function TemplatesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading templates">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-36 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((r) => (
            <div key={r} className="h-10 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
