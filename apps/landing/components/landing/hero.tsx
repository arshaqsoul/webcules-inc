import Image from "next/image";
import Link from "next/link";

import { CTAButton } from "@/components/shared/cta-button";

import { BrowserFrame } from "./browser-frame";
import { Reveal } from "./reveal";

export default function Hero() {
  return (
    <section className="grain relative isolate overflow-hidden pt-36 sm:pt-44">
      {/* Atmosphere: brand artwork, a lattice and a vignette. */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <Image
          src="/imgs/art/space-hero.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-bottom opacity-80"
        />
        <div className="grid-lines absolute inset-0 opacity-60 [mask-image:radial-gradient(60%_50%_at_50%_20%,black,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-darkest to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-darkest to-transparent" />
      </div>

      <div className="mx-auto max-w-6xl px-6 text-center">
        <Reveal>
          <Link
            href="#work"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-4 text-xs text-slate-300 backdrop-blur transition-colors hover:border-white/25"
          >
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 font-medium text-indigo-200">
              New
            </span>
            <span className="sm:hidden">Snap is now live</span>
            <span className="hidden sm:inline">
              Snap, our studio platform for photographers, is live
            </span>
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        </Reveal>

        <Reveal delay={0.08}>
          <h1 className="text-balance mx-auto mt-8 max-w-5xl text-5xl font-semibold leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-[5rem]">
            We design, build and run{" "}
            <span className="font-display whitespace-nowrap italic text-indigo-200">
              digital products
            </span>{" "}
            that scale.
          </h1>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-slate-300/90 sm:text-xl">
            Webcules is a senior team of engineers and designers. We take web,
            design, data and AI products from first sketch to production, and
            keep them running, with no hand-offs in between.
          </p>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mt-10 mx-auto flex max-w-xs flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row">
            <CTAButton size="lg" className="w-full sm:w-auto" />
            <Link
              href="#work"
              className="inline-flex h-13 w-full items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-8 text-base font-medium text-white transition-colors sm:w-auto hover:border-white/30 hover:bg-white/[0.08]"
            >
              See our work
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Product showcase */}
      <div
        data-robot="perch"
        data-robot-say="Hi, welcome!"
        className="relative mx-auto mt-20 max-w-6xl px-6 sm:mt-24"
      >
        <Reveal y={40} delay={0.2}>
          <div
            className="pointer-events-none absolute inset-x-[6%] -top-6 bottom-24 -z-10 rounded-[3rem] bg-gradient-to-b from-indigo-500/30 via-fuchsia-500/10 to-transparent blur-3xl"
            aria-hidden
          />
          <div className="relative [mask-image:linear-gradient(to_bottom,black_72%,transparent)]">
            <BrowserFrame
              src="/imgs/work/snap.webp"
              alt="Snap, a studio platform for photographers"
              url="snaphq.app"
              priority
              className="relative mx-auto w-full lg:w-[92%]"
              sizes="(min-width: 1024px) 70vw, 100vw"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
