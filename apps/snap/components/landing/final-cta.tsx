"use client";

import Link from "next/link";

import { FadeUp } from "./text-reveal";

/**
 * The dark finale — the toddler with the toy camera, closing the loop the
 * story opened: someone shot her first year, and one day she'll shoot too.
 */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden bg-[#0a0b0f] text-white">
      <img
        src="/imgs/landing/baby-mother.jpg"
        alt=""
        aria-hidden
        loading="lazy"
        className="absolute inset-0 h-full w-full select-none object-cover object-top opacity-40"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0a0b0f] via-[#0a0b0f]/55 to-[#0a0b0f]/90" />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-28 text-center sm:pb-32 sm:pt-40">
        <FadeUp>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/60 sm:text-[11px]">
            She's shooting on a toy camera today
          </p>
          <h2 className="snap-display mt-4 text-balance text-5xl leading-[1.02] sm:text-7xl">
            The rest of the story is <em className="italic">yours to shoot.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-sm leading-relaxed text-white/75 sm:text-lg">
            Snap handles the bookings, the galleries, the contracts and the payouts —
            you handle the light. Start free, keep 100% of what clients pay you.
          </p>
        </FadeUp>

        <FadeUp delay={0.12} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={signedIn ? "/dashboard" : "/signup"}
            className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#12141c] transition-transform hover:scale-[1.03] active:scale-[0.99]"
          >
            {signedIn ? "Open your studio" : "Create your studio — free"}
          </Link>
          <a
            href="#pricing"
            className="rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/15"
          >
            See pricing
          </a>
        </FadeUp>

        <FadeUp delay={0.2}>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50 sm:text-[11px]">
            20 GB free · no credit card · 0% commission, ever
          </p>
        </FadeUp>
      </div>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-white/50 sm:flex-row">
          <span className="flex items-center gap-2">
            <span aria-hidden className="grid h-5 w-5 place-items-center rounded-md bg-primary text-white">
              <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden>
                <circle cx="12" cy="12" r="9.75" stroke="currentColor" strokeWidth="1.9" />
                <path
                  d="M12 8.2 15.65 21.04M15.29 10.1 6 19.68M15.29 13.9 2.34 10.64M12 15.8 8.35 2.96M8.71 13.9 18 4.32M8.71 10.1 21.66 13.36"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            snap.webcules.com — a Webcules platform
          </span>
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-5">
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <Link href="/docs/embeds" className="transition-colors hover:text-white">Docs</Link>
            <Link href="/login" className="transition-colors hover:text-white">Sign in</Link>
            <Link href="/terms" className="transition-colors hover:text-white">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link href="https://webcules.com" className="transition-colors hover:text-white">webcules.com</Link>
          </nav>
          <span>Payments by Stripe · Storage on Cloudflare R2</span>
        </div>
      </footer>
    </section>
  );
}
