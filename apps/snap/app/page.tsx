import Link from "next/link";

export const metadata = {
  title: "Snap — The studio platform for photographers",
  description:
    "Branded booking widgets, a pipeline that mirrors your shoot, secure client galleries, and payments — one login, one bill. Zero platform fees, unlimited gallery viewing.",
};

const usps = [
  {
    title: "One login. One bill.",
    body: "CRM, booking, pipeline, galleries, and payments in one place. Stop paying for a CRM stack AND a gallery stack — Snap is the real all-in-one.",
  },
  {
    title: "We never take a cent of your bookings",
    body: "Client payments process through your own Stripe account at Stripe's standard rate. No platform commission, no markup — ever.",
  },
  {
    title: "Unlimited gallery viewing & downloads",
    body: "Your clients and their families can view and download full-resolution photos as much as they want. No compressed deliveries, no metered bandwidth.",
  },
  {
    title: "A pipeline that mirrors your shoot",
    body: "Booked → Snapping → Evaluation → Complete → Closed. The first true kanban board built for photography workflows — drag a card, that's it.",
  },
  {
    title: "Branded widgets for YOUR website",
    body: "Your logo, your colors, on your site. Embeddable contact form and booking calendar that match your brand — unlimited forms, no caps.",
  },
  {
    title: "Galleries built like vaults",
    body: "Email-code access, expiring links, one-click revocation, and full audit trails. Share confidently — leak a link and you can kill it instantly.",
  },
  {
    title: "RAW support with a RAW Vault",
    body: "Upload RAWs alongside photos and video. They stay hot for 6 months, extend anytime with one click — never silently deleted.",
  },
  {
    title: "Honest pricing, no traps",
    body: "Clear storage tiers with a simple overage rate. No shrinking free tiers, no 15% store commissions, no surprise price hikes.",
  },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    cadence: "",
    tagline: "Try the whole thing",
    features: ["20 GB (JPG)", "5 active galleries", "1 active booking", "Full CRM + pipeline"],
    cta: "Start free",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Lite",
    price: "$15",
    cadence: "/mo",
    tagline: "For part-timers growing",
    features: ["150 GB storage", "RAW Vault included", "15 active galleries", "Bookings + payments"],
    cta: "Start Lite",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Studio",
    price: "$29",
    cadence: "/mo",
    tagline: "The working pro's tier",
    features: [
      "500 GB, then $0.10/GB",
      "Unlimited galleries",
      "White-label everything",
      "RAW Vault + payment automations",
    ],
    cta: "Start Studio",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$59",
    cadence: "/mo",
    tagline: "Studios & teams",
    features: ["2 TB, then $0.10/GB", "Teams & permissions", "Contracts (coming)", "Priority support"],
    cta: "Start Pro",
    href: "/signup",
    highlight: false,
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-hairline bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="inline-block h-4 w-4 rounded-[4px] bg-primary" />
            Snap
          </span>
          <div className="flex items-center gap-3">
            <a href="#pricing" className="hidden text-sm text-ink-subtle hover:text-ink sm:block">
              Pricing
            </a>
            <Link
              href="/login"
              className="rounded-md border border-hairline bg-surface-1 px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-lavender-hover"
            >
              Create your studio
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center md:py-28">
        <p className="text-[13px] font-medium tracking-[0.4px] text-ink-subtle">WEBCULES · SNAP</p>
        <h1 className="max-w-3xl text-[40px] font-semibold leading-[1.1] tracking-[-1px] text-ink md:text-[56px] md:tracking-[-1.8px]">
          Run your whole studio from one place.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-ink-muted">
          Branded booking on your website, a pipeline that mirrors your shoot, vault-grade client
          galleries, and payments that pay out straight to you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-lavender-hover"
          >
            Create your studio — free
          </Link>
          <a
            href="#pricing"
            className="rounded-md border border-hairline bg-surface-1 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            See pricing
          </a>
        </div>
        <p className="text-xs text-ink-tertiary">
          Client payments processed by Stripe — their standard fee goes to Stripe, never to us.
        </p>
      </section>

      <section className="border-y border-hairline bg-surface-1">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.6px] text-ink md:text-[28px]">
              Why photographers switch to Snap
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-subtle">
              The old way is a CRM subscription plus a gallery subscription — $52–100 every month,
              twice the logins, none of it talking to each other.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {usps.map((u) => (
              <div key={u.title} className="rounded-[12px] border border-hairline bg-background p-5">
                <h3 className="text-[15px] font-medium text-ink">{u.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-subtle">{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-16 md:py-20">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.6px] text-ink md:text-[28px]">
            Simple pricing. Every tier.
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-subtle">
            Storage you can predict, overage at one honest rate, and zero commission on anything
            your clients pay you.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-[16px] border p-6 ${
                t.highlight ? "border-primary/50 bg-surface-1 ring-1 ring-primary/20" : "border-hairline bg-surface-1"
              }`}
            >
              {t.highlight && (
                <span className="mb-3 w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  Most popular
                </span>
              )}
              <h3 className="text-[15px] font-medium text-ink">{t.name}</h3>
              <p className="mt-1 text-xs text-ink-tertiary">{t.tagline}</p>
              <p className="mt-4">
                <span className="text-3xl font-semibold tracking-[-0.8px] text-ink">{t.price}</span>
                <span className="text-sm text-ink-subtle">{t.cadence}</span>
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-ink-muted">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-success-text">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={t.href}
                className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                  t.highlight
                    ? "bg-primary text-white hover:bg-lavender-hover"
                    : "border border-hairline bg-background text-ink hover:bg-surface-2"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-ink-tertiary">
          Overage beyond your tier's storage is $0.10/GB-month — we'll always show you the cheaper
          upgrade first. Payments processed by Stripe (their fee, not ours). RAW Vault: RAWs stay
          hot for 6 months, extend anytime, never silently deleted.
        </p>
      </section>

      <section className="border-t border-hairline bg-surface-1">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 py-16 text-center">
          <h2 className="max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.6px] text-ink">
            Still stacking a CRM and a gallery app?
          </h2>
          <p className="text-sm leading-relaxed text-ink-subtle">
            The typical stack — Dubsado or HoneyBook for clients, Pixieset or Pic-Time for galleries
            — runs $52–100/month. Snap Studio is $29. Same jobs, one bill, better galleries.
          </p>
          <Link
            href="/signup"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-lavender-hover"
          >
            Switch to Snap
          </Link>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-ink-tertiary">
          <span>snap.webcules.com — a Webcules platform app</span>
          <span>Payments by Stripe · Storage on Cloudflare R2</span>
        </div>
      </footer>
    </main>
  );
}
