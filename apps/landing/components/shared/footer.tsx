import Link from "next/link";

const columns = [
  {
    title: "Company",
    links: [
      { name: "Services", href: "/#services" },
      { name: "AI consulting", href: "/#ai" },
      { name: "Work", href: "/#work" },
      { name: "Process", href: "/#process" },
      { name: "Pricing", href: "/#pricing" },
      { name: "Blog", href: "/posts" },
      { name: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Apps",
    links: [
      { name: "Snap", href: "https://snaphq.app", external: true },
      { name: "tru", href: "https://tru.webcules.com", external: true },
      {
        name: "Backgrounds",
        href: "https://backgrounds.webcules.com",
        external: true,
      },
    ],
  },
  {
    title: "Use cases",
    links: [
      { name: "E-commerce", href: "/#services" },
      { name: "Custom ERP", href: "/#services" },
      { name: "SaaS apps", href: "/#services" },
      { name: "Internal tools", href: "/#services" },
      { name: "AI integration", href: "/#ai" },
      { name: "Data and dashboards", href: "/#services" },
    ],
  },
  {
    title: "Legal",
    links: [
      { name: "Privacy policy", href: "/privacy-policy" },
      { name: "Terms and conditions", href: "/terms" },
      { name: "Refund policy", href: "/refund-policy" },
    ],
  },
];

export const Footer = () => (
  <footer className="relative z-[1] mt-24 border-t border-white/10">
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-lg font-semibold text-white">
              W
            </span>
            <span className="text-xl font-semibold tracking-tight text-white">
              Webcules
            </span>
          </Link>
          <p className="font-display mt-5 max-w-xs text-2xl italic leading-snug text-slate-300">
            Concept to creation, for anything.
          </p>
          <div className="mt-6 space-y-1.5 text-sm text-slate-400">
            <a
              href="mailto:business@webcules.com?subject=Footer%20Contact"
              className="block transition-colors hover:text-white"
            >
              business@webcules.com
            </a>
            <a
              href="https://wa.me/16399986044?text=I'm%20interested%20in%20your%20services,%20let's%20talk"
              className="block transition-colors hover:text-white"
            >
              +1 639 998 6044
            </a>
            <p className="pt-1 text-slate-500">Saskatoon, Canada</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:col-span-8">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {col.title}
              </p>
              <ul className="mt-5 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.name}>
                    {"external" in l ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 transition-colors hover:text-white"
                      >
                        {l.name}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-slate-400 transition-colors hover:text-white"
                      >
                        {l.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-16 flex flex-col gap-2 border-t border-white/10 pt-8 text-sm text-slate-500 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Webcules Inc. All rights reserved.</p>
        <p>Web, design and data, with a human touch.</p>
      </div>
    </div>
  </footer>
);
