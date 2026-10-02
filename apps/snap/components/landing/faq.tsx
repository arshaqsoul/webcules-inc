"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

import { FadeUp } from "./text-reveal";

const FAQS = [
  {
    q: "Does Snap really take 0% commission?",
    a: "Yes. Client payments run through your own Stripe account at Stripe's standard processing rate. That fee goes to Stripe, never to us. We earn from the subscription, not from your clients' money.",
  },
  {
    q: "What do I actually get on the free plan?",
    a: "20 GB of storage (3 GB of it can be RAW), unlimited bookings, leads, projects, invoices and contract signatures, five concurrently active galleries with the full client feature set, folders, video delivery and the full CRM pipeline. No trial clock.",
  },
  {
    q: "Are my clients' galleries private?",
    a: "By default. Galleries are protected with email codes and expiring links, and access can be revoked in one click. We never run third-party analytics scripts on client-facing pages.",
  },
  {
    q: "Can I use my own brand and domain?",
    a: "Yes. Studio and above remove Snap branding from galleries, emails and invoices. Add a custom domain, such as photos.yourstudio.com, with SSL handled for you. Pro includes two.",
  },
  {
    q: "I already use another gallery or CRM tool. Is switching painful?",
    a: "Snap replaces the CRM, gallery, contracts and invoicing stack in one login, so you can move one client at a time. Start with a new booking and let the old projects wind down naturally.",
  },
  {
    q: "What happens if I go over my storage?",
    a: "We show you the cheaper upgrade first. If you stay put, overage is a flat $0.10 per GB per month, with no surprise tiers.",
  },
];

/** Objection handling in accordion form - answers are all tied to enforced plan limits. */
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
      <FadeUp className="mb-10 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">Questions</p>
        <h2 className="snap-display mt-3 text-4xl leading-[1.05] text-ink sm:text-6xl">
          Fair questions, <em className="italic">straight answers.</em>
        </h2>
      </FadeUp>
      <div className="divide-y divide-hairline rounded-2xl border border-hairline bg-background">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-ink sm:px-6 sm:py-5"
                >
                  {f.q}
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.25 }} className="shrink-0 text-ink-subtle">
                    <Plus className="h-4 w-4" />
                  </motion.span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-[14px] leading-relaxed text-ink-subtle sm:px-6">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
