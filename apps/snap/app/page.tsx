/* Placeholder root — marketing page arrives in a later story. Displays the
 * design system correctly applied (canvas, surface card, lavender accent,
 * negative-tracked display type per the Snap design doc). */

const pillars = [
  {
    title: "Branded widgets",
    body: "Embeddable contact form and booking calendar, themed to each studio's website.",
  },
  {
    title: "Project pipeline",
    body: "Booked → Snapping → Evaluation → Complete. Kanban that mirrors a shoot.",
  },
  {
    title: "Secure galleries",
    body: "Email-code-gated client links with expiry, revocation, and audit.",
  },
  {
    title: "Payments",
    body: "Deposits at booking, tracked balances, branded invoices.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-hairline px-6">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden
            className="inline-block h-4 w-4 rounded-[4px] bg-primary"
          />
          Snap
        </span>
        <a
          href="/api/health"
          className="rounded-md border border-hairline bg-surface-1 px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          Status
        </a>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-6 py-24">
        <div className="flex max-w-3xl flex-col gap-5">
          <p className="text-[13px] font-medium tracking-[0.4px] text-ink-subtle">
            WEBCULES · SNAP
          </p>
          <h1 className="text-[40px] font-semibold leading-[1.15] tracking-[-1px] text-ink md:text-[56px] md:leading-[1.1] md:tracking-[-1.8px]">
            The studio platform for photographers.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink-muted">
            Capture inquiries, book shoots, deliver galleries, and get paid — under your brand,
            on your website.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-[12px] border border-hairline bg-surface-1 p-6"
            >
              <h2 className="text-[15px] font-medium text-ink">{p.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-subtle">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-hairline px-6 py-8">
        <p className="mx-auto max-w-6xl text-xs text-ink-tertiary">
          snap.webcules.com — a Webcules platform app.
        </p>
      </footer>
    </main>
  );
}
