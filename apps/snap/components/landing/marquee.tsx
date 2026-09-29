"use client";

import { MARQUEE_A, MARQUEE_B, type Photo } from "./photos";
import { FadeUp } from "./text-reveal";

/**
 * Infinite image scroll — two print rows drifting opposite directions,
 * CSS-driven so it stays 60fps even while the story sections decode.
 */
export function MarqueeSection() {
  return (
    <section aria-label="Photographs delivered with Snap" className="overflow-hidden border-y border-hairline bg-background py-16 sm:py-20">
      <FadeUp className="mx-auto mb-10 max-w-2xl px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">
          Shot by working photographers
        </p>
        <h2 className="snap-display mt-3 text-4xl leading-tight text-ink sm:text-5xl">
          Weddings, wild things, first steps — <em className="italic">delivered on Snap.</em>
        </h2>
      </FadeUp>

      <div className="space-y-5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <MarqueeRow photos={MARQUEE_A} duration={70} />
        <MarqueeRow photos={MARQUEE_B} duration={88} reverse />
      </div>
    </section>
  );
}

function MarqueeRow({
  photos,
  duration,
  reverse = false,
}: {
  photos: Photo[];
  duration: number;
  reverse?: boolean;
}) {
  const doubled = [...photos, ...photos];
  return (
    <div className="group flex overflow-hidden">
      <div
        className="marquee-track flex w-max gap-5 pr-5"
        style={{
          animation: `marquee ${duration}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {doubled.map((photo, i) => (
          <figure
            key={`${photo.src}-${i}`}
            className="w-64 shrink-0 rotate-0 rounded-lg bg-white p-2 shadow-[0_10px_30px_rgb(15,16,17,0.12)] transition-transform duration-300 group-hover:[animation-play-state:paused] sm:w-72"
          >
            <img
              src={photo.src}
              alt={photo.alt}
              loading="eager"
              decoding="async"
              draggable={false}
              style={{ objectPosition: photo.position ?? "center" }}
              className="h-44 w-full select-none rounded-[5px] object-cover sm:h-48"
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
