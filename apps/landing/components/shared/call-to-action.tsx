import Image from "next/image";

import { Reveal } from "@/components/landing/reveal";

import { CTAButton } from "./cta-button";

export const CallToAction = () => (
  <section className="px-4 pb-4 sm:px-6">
    <Reveal>
      <div className="grain relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10">
        <Image
          src="/imgs/art/space-cta.webp"
          alt=""
          fill
          sizes="(min-width: 1152px) 1152px, 100vw"
          className="-z-10 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-darkest/60 via-darkest/40 to-darkest/80" />
        <div className="px-6 py-24 text-center sm:py-32">
          <h2
            data-robot="right"
            data-robot-say="Let's build it"
            className="text-balance mx-auto max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl"
          >
            Have something{" "}
            <span className="font-display italic text-indigo-100">
              worth building?
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-200/80">
            Book a free 30-minute discovery call. We will scope the product, the
            timeline and the budget with you.
          </p>
          <div className="mt-10 flex justify-center">
            <CTAButton size="lg" />
          </div>
        </div>
      </div>
    </Reveal>
  </section>
);
