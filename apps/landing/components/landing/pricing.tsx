import { Check } from "lucide-react";

import { CTAButton } from "@/components/shared/cta-button";

import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const core = [
  "A fast-loading website, up and running quickly",
  "Sketches turned into user-friendly designs",
  "Data handled from source to destination",
  "Zero-downtime launch",
];
const growth = [
  "Interactive sites and apps with 3D elements",
  "Detailed Figma prototypes",
  "Data cleansing and transformation for better insight",
  "Complex web applications with advanced functionality",
  "Fast, high-performance deployment",
];
const premium = ["Priority support, 24/7", "Unlimited design revisions"];

const tiers = [
  {
    name: "Particle",
    price: "Fixed",
    unit: "one-time project",
    blurb: "A defined deliverable at a fixed price.",
    sprints: "Scoped per project",
    features: core,
  },
  {
    name: "Atom",
    price: "$1,250",
    unit: "per 2-week sprint",
    blurb: "Steady product momentum, one sprint at a time.",
    sprints: "1 sprint per month",
    features: [...core, ...growth],
    highlight: true,
  },
  {
    name: "Molecule",
    price: "$2,400",
    unit: "per 2-week sprint",
    blurb: "A faster cadence with priority support.",
    sprints: "2 sprints per month",
    features: [...core, ...growth, ...premium],
  },
  {
    name: "Compound",
    price: "Let's talk",
    unit: "tailored engagement",
    blurb: "A custom team and cadence for ambitious roadmaps.",
    sprints: "Custom sprints",
    features: [...core, ...growth, ...premium],
  },
];

export default function Pricing() {
  return (
    <section
      id="pricing"
      className="relative border-t border-white/10 py-28 sm:py-36"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(99,102,241,0.18),transparent)]" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          say="Pick a cadence that fits"
          align="center"
          eyebrow="Pricing"
          title={
            <>
              Transparent pricing,{" "}
              <span className="font-display italic text-indigo-200">
                tailored scope
              </span>
              .
            </>
          }
          description="Pick the cadence that fits your roadmap. Every engagement starts with a free discovery call."
        />

        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.06} className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-3xl border p-7 ${
                  t.highlight
                    ? "border-indigo-400/50 bg-gradient-to-b from-indigo-500/[0.14] to-white/[0.02] shadow-[0_30px_80px_-30px_rgba(99,102,241,0.6)]"
                    : "border-white/10 bg-white/[0.025]"
                }`}
              >
                {t.highlight ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-indigo-400 px-3 py-0.5 text-xs font-medium text-indigo-950">
                    Start here
                  </span>
                ) : null}
                <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                  {t.name}
                </h3>
                <p className="mt-5 text-4xl font-semibold tracking-tight text-white">
                  {t.price}
                </p>
                <p className="mt-1 text-sm text-slate-500">{t.unit}</p>
                <p className="mt-5 text-sm leading-relaxed text-slate-400">
                  {t.blurb}
                </p>
                <div className="mt-6">
                  <CTAButton
                    size="sm"
                    variant={t.highlight ? "primary" : "ghost"}
                    className="w-full"
                  >
                    Get started
                  </CTAButton>
                </div>
                <p className="mt-6 border-t border-white/10 pt-5 text-xs font-medium text-slate-300">
                  {t.sprints}
                </p>
                <ul className="mt-4 space-y-3">
                  {t.features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-3 text-sm leading-snug text-slate-400"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-indigo-300" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
