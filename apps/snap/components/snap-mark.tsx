/* Snap brand mark — the lavender aperture tile. The single source for the
 * in-app logo: auth headers, onboarding, dashboard sidebar, docs. The same
 * geometry as public/icon.svg (six-blade iris, 60° symmetry).
 * Client-facing surfaces (galleries, invoices, contracts, booking pages)
 * deliberately DON'T use this — white-label is the product. */
export function SnapMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-[6px] bg-primary text-white ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[62.5%] w-[62.5%]">
        <circle cx="12" cy="12" r="9.75" stroke="currentColor" strokeWidth="1.9" />
        <path
          d="M12 8.2 15.65 21.04M15.29 10.1 6 19.68M15.29 13.9 2.34 10.64M12 15.8 8.35 2.96M8.71 13.9 18 4.32M8.71 10.1 21.66 13.36"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
