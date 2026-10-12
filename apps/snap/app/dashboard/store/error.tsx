"use client";

/* /dashboard/store load error (WEB-277, WEB-175 handoff state matrix):
 * role=alert card, exact handoff copy, Try again via the boundary reset.
 * The status card is hidden in this state (it can't be trusted). */
export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 flex w-full max-w-lg flex-col items-center gap-3 rounded-xl border border-hairline bg-surface px-6 py-10 text-center">
      <span className="text-2xl" aria-hidden>⚠️</span>
      <h1 className="text-lg font-semibold tracking-[-0.3px] text-ink">We couldn&apos;t load your store</h1>
      <p className="text-sm text-ink-subtle">
        Your price lists and products are safe — this was a connection problem, not a store problem.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
