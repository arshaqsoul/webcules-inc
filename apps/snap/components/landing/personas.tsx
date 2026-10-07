"use client";

import Link from "next/link";

import { TALK_TO_US_HREF } from "@/lib/tier-cards";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import { FadeUp } from "./text-reveal";

const PERSONAS = [
  {
    id: "solo",
    tab: "Solo photographer",
    plan: "Free - $0",
    title: "Look like a studio of ten, from day one.",
    body: "Start with everything you need to book, contract, deliver and get paid - and not a dollar of commission on any of it. 20 GB and five live galleries are on the house.",
    points: ["Unlimited bookings, leads and invoices", "Private galleries with favorites and video", "Full CRM and pipeline", "Pay only when you outgrow free"],
    photos: ["portrait-woman.jpg", "wedding-couple.jpg", "family.jpg"],
    cta: { label: "Start free", href: "/signup?plan=free" },
  },
  {
    id: "growing",
    tab: "Growing business",
    plan: "Lite $15 · Studio $29",
    title: "Your brand on everything. Your time back.",
    body: "Drop the Snap branding, add watermarks and download approvals, and let payment automations chase invoices while you sleep. Unlimited galleries, forms and contract templates.",
    points: ["White-label galleries, emails and invoices", "Sneak peeks and per-photo insights", "Unlimited session types and templates", "Custom domain add-on"],
    photos: ["wedding-sparkler.jpg", "newborn.jpg", "portrait-man.jpg"],
    cta: { label: "Start Studio", href: "/signup?plan=studio" },
  },
  {
    id: "team",
    tab: "Multi-shooter studio",
    plan: "Custom - talk to us",
    title: "One platform for the whole team.",
    body: "Teams and permissions, a bigger storage pool, extra custom domains and priority support, priced to fit your studio. Associate shooters and editors get exactly the access they need.",
    points: ["Teams and role permissions", "1 TB+ pooled storage", "Extra custom domains", "Priority support"],
    photos: ["street-dusk.jpg", "scenery-lake.jpg", "wedding-dance.jpg"],
    cta: { label: "Talk to us", href: TALK_TO_US_HREF },
  },
] as const;

/** Solo to studio: one product, three honest on-ramps - tabs with a photo collage that re-deals on switch. */
export function Personas() {
  const [i, setI] = useState(0);
  const p = PERSONAS[i]!;
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-32">
      <FadeUp className="mx-auto mb-10 max-w-3xl text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">Built for every size of studio</p>
        <h2 className="snap-display mt-3 text-balance text-4xl leading-[1.04] text-ink sm:text-6xl">
          Start alone. <em className="italic">Scale to a team.</em>
        </h2>
      </FadeUp>

      <div role="tablist" aria-label="Who Snap is for" className="mx-auto mb-10 flex w-fit max-w-full overflow-x-auto rounded-full border border-hairline bg-surface-1 p-1">
        {PERSONAS.map((x, idx) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={i === idx}
            onClick={() => setI(idx)}
            className="relative whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-colors sm:px-5"
          >
            {i === idx && (
              <motion.span layoutId="persona-pill" className="absolute inset-0 rounded-full bg-background shadow-sm ring-1 ring-hairline" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
            )}
            <span className={`relative ${i === idx ? "text-ink" : "text-ink-subtle"}`}>{x.tab}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-hairline bg-surface-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={p.id}
            role="tabpanel"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:p-14"
          >
            <div>
              <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-primary">{p.plan}</span>
              <h3 className="snap-display mt-5 text-[34px] leading-[1.05] text-ink sm:text-[46px]">{p.title}</h3>
              <p className="mt-4 text-pretty text-[15px] leading-relaxed text-ink-subtle">{p.body}</p>
              <ul className="mt-6 grid gap-2.5 text-sm text-ink-muted sm:grid-cols-2">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} /> {pt}
                  </li>
                ))}
              </ul>
              <Link
                href={p.cta.href}
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-lavender-hover"
              >
                {p.cta.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid h-[320px] grid-cols-[1.2fr_1fr] grid-rows-2 gap-3 sm:h-[400px]">
              {p.photos.map((src, idx) => (
                <motion.div
                  key={src}
                  initial={{ opacity: 0, scale: 0.92, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.08 * idx, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className={`overflow-hidden rounded-2xl bg-surface-3 ${idx === 0 ? "row-span-2" : ""}`}
                >
                  <img src={`/imgs/landing/t/${src}`} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
