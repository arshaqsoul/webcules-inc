"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

import { MARQUEE_A, MARQUEE_B, type Photo } from "./photos";
import { FadeUp } from "./text-reveal";

/** Each column drifts vertically at its own pace, alternating direction. */
const COLUMNS: { photos: Photo[]; duration: number; reverse: boolean; hideBelow?: "sm" | "lg" }[] = [
  { photos: pick(0), duration: 90, reverse: false },
  { photos: pick(1), duration: 110, reverse: true },
  { photos: pick(2), duration: 80, reverse: false, hideBelow: "sm" },
  { photos: pick(3), duration: 100, reverse: true, hideBelow: "lg" },
  { photos: pick(4), duration: 85, reverse: false, hideBelow: "lg" },
];

const ASPECTS = ["aspect-[4/5]", "aspect-square", "aspect-[3/4]", "aspect-[4/3]", "aspect-[2/3]"];

function pick(col: number): Photo[] {
  const all = [...MARQUEE_A, ...MARQUEE_B];
  const out: Photo[] = [];
  for (let i = col; i < all.length; i += 5) out.push(all[i]!);
  return out;
}

/**
 * The work, as a living wall: five columns of frames sliding past each other.
 * Hover a frame and the whole wall slows, the frame lifts and a client's
 * heart lands on it - the same favorite loop clients use in a real gallery.
 */
export function MasonryWall() {
  return (
    <section aria-label="Photographs delivered with Snap" className="relative overflow-hidden bg-[#0a0b0f] py-20 text-white sm:py-28">
      <FadeUp className="relative z-10 mx-auto mb-12 max-w-3xl px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/50 sm:text-[11px]">The work comes first</p>
        <h2 className="snap-display mt-3 text-balance text-4xl leading-[1.04] sm:text-6xl">
          Your photographs deserve <em className="italic">a better stage.</em>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
          Weddings, wildlife, newborns, headshots. Snap galleries are built to show images at full size and make
          clients fall for them all over again - on any device, under your brand.
        </p>
      </FadeUp>

      <div className="group/wall relative mx-auto grid h-[640px] max-w-[1400px] grid-cols-2 gap-3 px-3 sm:h-[760px] sm:grid-cols-3 lg:grid-cols-5">
        {COLUMNS.map((c, i) => (
          <Column key={i} {...c} />
        ))}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-[#0a0b0f] to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-[#0a0b0f] to-transparent" />
      </div>
    </section>
  );
}

function Column({
  photos,
  duration,
  reverse,
  hideBelow,
}: {
  photos: Photo[];
  duration: number;
  reverse: boolean;
  hideBelow?: "sm" | "lg";
}) {
  const doubled = [...photos, ...photos];
  const visibility = hideBelow === "sm" ? "hidden sm:block" : hideBelow === "lg" ? "hidden lg:block" : "";
  return (
    <div className={`relative overflow-hidden ${visibility}`}>
      <div
        className="masonry-track flex flex-col gap-3 pb-3 group-hover/wall:[animation-duration:240s]"
        style={{
          animation: `masonry-y ${duration}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {doubled.map((photo, i) => (
          <Frame key={`${photo.src}-${i}`} photo={photo} aspect={ASPECTS[(i + photos.length) % ASPECTS.length]!} />
        ))}
      </div>
    </div>
  );
}

function Frame({ photo, aspect }: { photo: Photo; aspect: string }) {
  const [liked, setLiked] = useState(false);
  return (
    <figure
      onPointerEnter={() => setLiked(true)}
      onPointerLeave={() => setLiked(false)}
      className={`group/frame relative shrink-0 overflow-hidden rounded-xl bg-white/5 ${aspect} transition-transform duration-500 hover:z-20 hover:scale-[1.04]`}
    >
      <img
        src={photo.src}
        alt={photo.alt}
        loading="eager"
        decoding="async"
        draggable={false}
        style={{ objectPosition: photo.position ?? "center" }}
        className="h-full w-full select-none object-cover transition-transform duration-700 group-hover/frame:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/frame:opacity-100" />
      <span
        className={`absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-lg transition-all duration-300 ${
          liked ? "scale-100 opacity-100" : "scale-50 opacity-0"
        }`}
      >
        <Heart className="h-4 w-4 fill-[#e5484d] text-[#e5484d]" />
      </span>
    </figure>
  );
}
