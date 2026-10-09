const names = [
  "Snap",
  "tru",
  "ELUX Travels",
  "Backgrounds",
  "CoPrompt",
  "SkyHigh",
  "JesminPrints",
  "Lazyfor",
];

/** A quiet, slow ticker of products and clients we have shipped for. */
export function Marquee() {
  const row = [...names, ...names];
  return (
    <section
      aria-label="Products and clients"
      className="border-y border-white/10 py-10"
    >
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
        Products and platforms we have shipped
      </p>
      <div className="marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
        <div className="marquee-track flex w-max items-center gap-16 pr-16">
          {row.map((name, i) => (
            <span
              key={`${name}-${i}`}
              aria-hidden={i >= names.length}
              className="font-display text-3xl italic text-slate-500 transition-colors hover:text-slate-200 sm:text-4xl"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
