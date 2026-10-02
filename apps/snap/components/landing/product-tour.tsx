"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

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
    bullets: ["Every lead and project in one view", "Cull in triage mode, keep or reject", "Status-driven client emails"],
  },
  {
    id: "gallery",
    kicker: "04 · Deliver",
    title: "Galleries your clients will actually show off.",
    body: "Designed covers, slideshows, a client photo app, favorites and downloads - private by default with email codes and expiring links, white-labeled to your brand.",
    bullets: ["Favorites and download approvals", "RAW vault, video and slideshows", "Your logo, colors and domain"],
  },
  {
    id: "payments",
    kicker: "05 · Get paid",
    title: "Invoices that get paid, and keep every cent.",
    body: "Invoice presets, payment reminders and installments - paid out to your own Stripe account. Snap takes 0% commission. Ever.",
    bullets: ["Zero platform commission", "Automatic reminders", "Payments tied to each project"],
  },
];

/** Sticky storytelling: the copy scrolls, the laptop stays and re-plays the matching scene. */
export function ProductTour() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLDivElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="tour" className="relative mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-32 lg:pb-0 pb-20">
      <FadeUp className="mx-auto mb-14 max-w-3xl text-center sm:mb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">One workflow</p>
        <h2 className="snap-display mt-3 text-balance text-4xl leading-[1.04] text-ink sm:text-6xl">
          From first message to final payout, <em className="italic">without leaving Snap.</em>
        </h2>
      </FadeUp>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-16">
        <div>
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-i={i}
              className="flex flex-col justify-center py-6 lg:h-[88vh] lg:last:h-[62vh]"
            >
              <motion.div
                animate={{ opacity: active === i ? 1 : 0.35 }}
                transition={{ duration: 0.4 }}
                className="max-lg:!opacity-100"
              >
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
              </motion.div>
              <div className="mt-8 lg:hidden">
                <LaptopReplay scene={s.id} />
              </div>
            </div>
          ))}
        </div>

        <div className="relative hidden lg:block">
          <div className="sticky top-0 flex h-screen flex-col justify-center">
            <div className="absolute inset-x-[-40px] top-[22%] -z-10 h-[56%] rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_40%,rgb(94,106,210,0.16),transparent_70%)]" />
            <AnimatePresence mode="wait">
              <motion.div
                key={STEPS[active]!.id}
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <LaptopReplay scene={STEPS[active]!.id} />
              </motion.div>
            </AnimatePresence>
            <div className="mt-8 flex justify-center gap-2">
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
