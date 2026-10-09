import { ArrowUpRight } from "lucide-react";

import { BrowserFrame } from "./browser-frame";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const featured = [
  {
    name: "Snap",
    kind: "Studio platform for photographers",
    body: "Branded booking, a pipeline that mirrors the shoot, vault-grade client galleries and payments that pay out straight to the photographer.",
    href: "https://snaphq.app",
    host: "snaphq.app",
    img: "/imgs/work/snap.webp",
    tags: ["Product", "Payments", "Galleries"],
  },
  {
    name: "tru",
    kind: "Workflow automation, pay per run",
    body: "Connect the apps a business already runs on and let tru handle the tedious stuff. No subscription and no per-seat fees.",
    href: "https://tru.webcules.com",
    host: "tru.webcules.com",
    img: "/imgs/work/tru.webp",
    tags: ["Product", "Automation", "Edge"],
  },
  {
    name: "ELUX Travels",
    kind: "Multi-region travel booking",
    body: "Tours, hotels, flights and cruises for UK and Sri Lankan travellers. Faceted search, a block-based quote and itinerary builder, and deposit or instalment payment plans, running on the Cloudflare edge so CMS edits go live in seconds.",
    href: "https://eluxtravels.uk",
    host: "eluxtravels.uk",
    img: "/imgs/work/elux.webp",
    tags: ["Client platform", "Payload CMS", "Cloudflare"],
  },
  {
    name: "Backgrounds",
    kind: "AI-crafted design backdrops",
    body: "A curated library of high-quality, ready-to-use visuals for creatives, unlockable per collection.",
    href: "https://backgrounds.webcules.com",
    host: "backgrounds.webcules.com",
    img: "/imgs/work/backgrounds.webp",
    tags: ["Product", "Commerce", "AI"],
  },
];

const clientWork = [
  {
    name: "JesminPrints",
    body: "A custom warehouse management system for collecting and baling waste paper for export.",
  },
  {
    name: "SkyHigh",
    body: "A tuition platform to manage class schedules, students and payments.",
  },
  {
    name: "CoPrompt",
    body: "Collaborative prompting, from private AI threads to group chats for research with colleagues.",
  },
  {
    name: "Lazyfor",
    body: "A portfolio site for a creative with plenty to show and no time to launch it.",
  },
];

export default function Work() {
  return (
    <section
      id="work"
      className="relative border-t border-white/10 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          say="Real products, live today"
          eyebrow="Selected work"
          title={
            <>
              Products we built, run and{" "}
              <span className="font-display italic text-indigo-200">
                stand behind
              </span>
              .
            </>
          }
          description="Products we run ourselves, and platforms we built end to end for clients. All of them live today."
        />

        <div className="mt-20 space-y-24 sm:space-y-32">
          {featured.map((p, i) => (
            <Reveal key={p.name}>
              <article className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit ${p.name}`}
                  className={`group relative lg:col-span-7 ${
                    i % 2 ? "lg:order-2" : ""
                  }`}
                >
                  <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-indigo-500/20 via-transparent to-fuchsia-500/15 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                  <BrowserFrame
                    src={p.img}
                    alt={`${p.name} product screenshot`}
                    url={p.host}
                    sizes="(min-width: 1024px) 55vw, 100vw"
                    className="transition-transform duration-500 group-hover:-translate-y-1.5"
                  />
                </a>
                <div className={`lg:col-span-5 ${i % 2 ? "lg:order-1" : ""}`}>
                  <p className="font-mono text-xs text-indigo-300/80">
                    0{i + 1}
                  </p>
                  <h3 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {p.name}
                  </h3>
                  <p className="font-display mt-2 text-2xl italic text-slate-300">
                    {p.kind}
                  </p>
                  <p className="mt-5 leading-relaxed text-slate-400">
                    {p.body}
                  </p>
                  <ul className="mt-6 flex flex-wrap gap-2">
                    {p.tags.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-white underline-offset-8 hover:underline"
                  >
                    Visit {p.host}
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-28">
          <h3 className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Also built for clients
          </h3>
          <div className="mt-6 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {clientWork.map((c) => (
              <div key={c.name} className="bg-darkest p-7">
                <p className="font-display text-2xl italic text-white">
                  {c.name}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
