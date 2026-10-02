"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";

import { LaptopReplay, type SceneId } from "./screens";
import { FadeUp } from "./text-reveal";

const STEPS: { id: SceneId; kicker: string; title: string; body: string; bullets: string[] }[] = [
  {
    id: "calendar",
    kicker: "01 · Book",
    title: "Bookings that fill the calendar themselves.",
    body: "An embeddable booking page with session types, deposits and intake questions. Clients pick a slot, pay, and land on your calendar - with the contract already on its way.",
    bullets: ["Deposits straight to your Stripe", "Open leads show as tentative dates", "Embed it on your own site"],
  },
  {
    id: "contract",
    kicker: "02 · Sign",
    title: "Contracts signed before the first frame.",
    body: "Send, track and countersign from one place. Merge fields fill in the client, date and package, and the signed PDF is filed on the project for good.",
    bullets: ["Reusable templates", "Sent / viewed / signed tracking", "Questionnaires and forms alongside"],
  },
  {
    id: "pipeline",
    kicker: "03 · Shoot",
    title: "A pipeline that mirrors how you actually work.",
    body: "Booked, Snapping, Evaluation, Complete, Closed. The first kanban built for photography - drag a card and the whole project follows, emails and all.",
    bullets: ["Every lead and project in one view", "Status-driven client emails", "Nothing slips between shoots"],
  },
  {
    id: "cull",
    kicker: "04 · Cull",
    title: "Cull thousands of frames in minutes.",
    body: "Triage mode turns the worst part of the job into a flick: swipe or tap to keep or pass, rate as you go, and every flag and folder stays in sync with the gallery.",
    bullets: ["Keep / pass with one key", "Ratings, flags and folders", "Straight from cull to client gallery"],
  },
  {
    id: "templates",
    kicker: "05 · Design",
    title: "A designed gallery in one click.",
    body: "Pick from ten designer templates - wedding, cinematic, editorial, minimal - and swap in your photos. Or build your own with the page builder. Undo any time.",
    bullets: ["10 templates, free on every plan", "Sections, themes and collages", "Apply and undo without losing work"],
  },
  {
    id: "gallery",
    kicker: "06 · Deliver",
    title: "Galleries your clients will actually show off.",
    body: "Designed covers, slideshows, a client photo app, favorites and downloads - white-labeled to your brand, so the delivery feels as good as the shoot.",
    bullets: ["Favorites and download approvals", "RAW vault, video and slideshows", "Your logo, colors and domain"],
  },
  {
    id: "secure",
    kicker: "07 · Protect",
    title: "Private by default. Revocable in one click.",
    body: "Clients unlock galleries with an emailed code. Links expire, downloads can be PIN-protected, and a single click kills a link everywhere.",
    bullets: ["Email codes and expiring links", "Download PINs and approvals", "One-click revoke"],
  },
  {
    id: "payments",
    kicker: "08 · Get paid",
    title: "Invoices that get paid, and keep every cent.",
    body: "Invoice presets, payment reminders and installments - paid out to your own Stripe account. Snap takes 0% commission. Ever.",
    bullets: ["Zero platform commission", "Automatic reminders", "Payments tied to each project"],
  },
];

function StepCopy({ s }: { s: (typeof STEPS)[number] }) {
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">{s.kicker}</p>
      <h3 className="snap-display mt-3 text-[34px] leading-[1.05] text-ink sm:text-[44px]">{s.title}</h3>
      <p className="mt-4 text-pretty text-[15px] leading-relaxed text-ink-subtle">{s.body}</p>
      <ul className="mt-5 space-y-2 text-sm text-ink-muted">
        {s.bullets.map((b) => (
          <li key={b} className="flex items-center gap-2.5">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
            {b}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Pinned storytelling: on desktop the copy and the laptop are both pinned to
 * the viewport center and swap together as you scroll (progress picks the
 * step), so they can never drift out of alignment. Mobile stacks each step.
 */
export function ProductTour() {
  const track = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) =>
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)))),
  );
  const step = STEPS[active]!;

  return (
    <section id="tour" className="relative mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-32">
      <FadeUp className="mx-auto mb-14 max-w-3xl text-center sm:mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">One workflow</p>
        <h2 className="snap-display mt-3 text-balance text-4xl leading-[1.04] text-ink sm:text-6xl">
          From first message to final payout, <em className="italic">without leaving Snap.</em>
        </h2>
      </FadeUp>

      {/* mobile / tablet: stacked */}
      <div className="space-y-16 pb-20 lg:hidden">
        {STEPS.map((s) => (
          <div key={s.id}>
            <StepCopy s={s} />
            <div className="mt-8">
              <LaptopReplay scene={s.id} />
            </div>
          </div>
        ))}
      </div>

      {/* desktop: pinned */}
      <div ref={track} className="relative hidden lg:block" style={{ height: `${STEPS.length * 65}vh` }}>
        <div className="sticky top-0 grid h-screen grid-cols-[minmax(0,400px)_minmax(0,1fr)] items-center gap-16">
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <StepCopy s={step} />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="relative">
            <div className="absolute inset-x-[-40px] inset-y-[-10%] -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_50%,rgb(94,106,210,0.16),transparent_70%)]" />
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <LaptopReplay scene={step.id} />
              </motion.div>
            </AnimatePresence>
            <div className="mt-10 flex justify-center gap-2">
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  aria-hidden
                  className={`h-1.5 rounded-full transition-all duration-500 ${active === i ? "w-8 bg-primary" : "w-1.5 bg-hairline-strong"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
