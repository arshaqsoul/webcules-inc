"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { Chapter, ChapterTitles, PhotoLayer, Viewfinder } from "./chapter";
import { FAMILY_FRAMES, TOWN_FRAME, WEDDING_FRAMES, WILD_FRAMES } from "./photos";

/* ------------------------------------------------------------------ */
/* Chapter one — the wild. Focus-pull sequence.                        */
/* ------------------------------------------------------------------ */

const WILD_TITLES = [
  { kicker: "Chapter one", title: "The world, in focus.", sub: "Every photographer starts here — learning to see. This story starts at 5 a.m., in the reeds." },
  { title: "Patient." },
  { title: "Backlit." },
  { title: "1/2000th of a second." },
  { title: "Color, straight out of camera." },
  { title: "Closer." },
  { title: "Closer still." },
];

export function WildChapter() {
  return (
    <Chapter id="story" vh={520}>
      {(progress) => (
        <>
          {WILD_FRAMES.map((photo, i) => (
            <PhotoLayer
              key={photo.src}
              photo={photo}
              progress={progress}
              start={i === 0 ? 0 : i * 0.16}
              end={Math.min(i * 0.16 + 0.18, 1)}
              push={1.22}
              focusPull
              fadeOut={i < WILD_FRAMES.length - 1}
            />
          ))}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
          <Viewfinder
            progress={progress}
            exif={[
              "Red fox · ƒ/1.8 · 1/800",
              "Whitetail · ƒ/2.8 · 1/1250",
              "Kingfisher · ƒ/4 · 1/2000",
              "Macaw · ƒ/5.6 · 1/640",
              "Poppies · ƒ/2 · 1/2000",
              "Rain · ƒ/8 · 1/250",
            ]}
          />
          <ChapterTitles
            progress={progress}
            className="bottom-24 left-6 z-30 sm:bottom-28 sm:left-12"
            windows={WILD_TITLES.map((t, i) => ({
              start: i === 0 ? 0.005 : i * 0.16 + 0.02,
              end: i === 0 ? 0.15 : i * 0.16 + 0.16,
              node: (
                <>
                  {t.kicker ? (
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/70 sm:text-[11px]">
                      {t.kicker}
                    </p>
                  ) : null}
                  <h2 className="snap-display text-4xl leading-[1.02] text-white sm:text-6xl">{t.title}</h2>
                  {t.sub ? <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">{t.sub}</p> : null}
                </>
              ),
            }))}
          />
        </>
      )}
    </Chapter>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter two — the city.                                             */
/* ------------------------------------------------------------------ */

export function TownChapter() {
  return (
    <Chapter vh={230}>
      {(progress) => (
        <>
          <TownLayer photo={TOWN_FRAME} progress={progress} />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/35" />
          <Viewfinder progress={progress} exif={["City · ƒ/5.6 · 1/500 · ISO 200", "City · ƒ/5.6 · 1/500 · ISO 200", "The call · ƒ/1.8 · 1/250"]} />
          <ChapterTitles
            progress={progress}
            className="bottom-24 left-6 z-30 sm:bottom-28 sm:left-12"
            windows={[
              {
                start: 0.01,
                end: 0.62,
                node: (
                  <>
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/70 sm:text-[11px]">Chapter two</p>
                    <h2 className="snap-display text-4xl leading-[1.02] text-white sm:text-6xl">Then life gets loud.</h2>
                    <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">
                      Clients. Shoots. Edits. Invoices at midnight. The busy part nobody
                      romanticizes — and the part Snap takes off your hands.
                    </p>
                  </>
                ),
              },
              {
                start: 0.66,
                end: 0.99,
                node: (
                  <h2 className="snap-display text-4xl leading-[1.05] text-white sm:text-6xl">
                    Then the phone rings — <em className="italic">a wedding.</em>
                  </h2>
                ),
              },
            ]}
          />
        </>
      )}
    </Chapter>
  );
}

function TownLayer({ photo, progress }: { photo: (typeof TOWN_FRAME); progress: MotionValue<number> }) {
  // slow fade-in — this IS the dissolve from the wild chapter's tail
  const opacity = useTransform(progress, [0, 0.08, 0.88, 1], [0, 1, 1, 0]);
  const scale = useTransform(progress, [0, 1], [1.04, 1.24]);
  const sat = useTransform(progress, [0, 0.5], [0.35, 1.1]);
  const filter = useTransform(sat, (s) => `saturate(${s})`);
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      <motion.img
        src={photo.src}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{ scale, filter }}
        className="h-full w-full select-none object-cover will-change-transform"
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter three — the wedding. The flipbook.                          */
/* ------------------------------------------------------------------ */

const FLIP_BOOK = WEDDING_FRAMES.slice(1, 6); // couple, bouquet, rings, sparkler, table
const DANCE_FRAME = { src: "/imgs/landing/wedding-dance.jpg", alt: "Guests raising glasses over the dance floor" };

export function WeddingChapter() {
  return (
    <Chapter vh={500} className="bg-[#101116]">
      {(progress) => (
        <>
          {/* the light table: a dark room, one soft lamp over the prints */}
          <div
            aria-hidden
            className="absolute inset-0 z-10"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 42%, rgb(94,106,210,0.14), transparent 70%), radial-gradient(120% 90% at 50% 50%, #1b1c22 40%, #101116 100%)",
            }}
          />
          <WeddingScenes progress={progress} />
          <ShutterCounter progress={progress} />
          <ChapterTitles
            progress={progress}
            className="bottom-24 left-6 z-30 sm:bottom-28 sm:left-12"
            windows={[
              {
                start: 0.005,
                end: 0.15,
                node: (
                  <>
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/70 sm:text-[11px]">Chapter three</p>
                    <h2 className="snap-display text-4xl leading-[1.02] text-white sm:text-6xl">
                      Two people say <em className="italic">yes.</em>
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">
                      The dress at 7 a.m. The rings at noon. Twelve hours on your feet —
                      flip through the day.
                    </p>
                  </>
                ),
              },
              {
                start: 0.87,
                end: 0.99,
                node: (
                  <>
                    <h2 className="snap-display text-3xl leading-[1.05] text-white sm:text-5xl">
                      1,240 frames in. 87 keepers, culled on the train home.
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">
                      Delivered that night — in a gallery their families open with an
                      email code. Downloaded in full resolution, as much as they want.
                    </p>
                  </>
                ),
              },
            ]}
          />
        </>
      )}
    </Chapter>
  );
}

function WeddingScenes({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      {/* opening: the dress */}
      <PhotoLayer photo={WEDDING_FRAMES[0]} progress={progress} start={0} end={0.17} push={1.14} fadeOut />
      {/* flipbook */}
      {FLIP_BOOK.map((photo, i) => (
        <FlipPrint
          key={photo.src}
          photo={photo}
          index={i}
          total={FLIP_BOOK.length}
          progress={progress}
          from={0.17}
          to={0.84}
        />
      ))}
      {/* closing: the toast */}
      <PhotoLayer photo={DANCE_FRAME} progress={progress} start={0.85} end={1} push={1.18} fadeOut={false} />
    </>
  );
}

/**
 * Prints flipping on a light table: the active print rotates away (Y-flip,
 * like turning a stack of 4×6s) while the next one rises beneath it.
 */
function FlipPrint({
  photo,
  index,
  total,
  progress,
  from,
  to,
}: {
  photo: (typeof FLIP_BOOK)[number];
  index: number;
  total: number;
  progress: MotionValue<number>;
  from: number;
  to: number;
}) {
  const slice = (to - from) / total;
  const start = from + index * slice;
  const flipAt = start + slice * 0.72;

  // The whole stack is laid on the light table when the flipbook opens; each
  // print disappears only as its own flip completes. Highest z = earliest.
  const opacity = useTransform(
    progress,
    [from - 0.02, from + 0.01, flipAt + slice * 0.06, flipAt + slice * 0.12],
    [0, 1, 1, 0],
  );
  const rotateY = useTransform(progress, [start + 0.08, flipAt], [0, -165]);
  const scale = useTransform(progress, [start, flipAt], [0.985, 1.015]);
  const y = useTransform(progress, [start, flipAt], [10, -18]);

  return (
    <motion.div
      style={{ opacity, transformStyle: "preserve-3d", zIndex: 20 + (total - index) }}
      className="absolute inset-0 grid place-items-center [perspective:1400px]"
    >
      <motion.div
        style={{ rotateY, scale, y, transformStyle: "preserve-3d" }}
        className={`relative aspect-[4/5] w-[68vw] max-w-[420px] sm:w-[380px] ${
          index % 2 === 0 ? "rotate-[-2deg]" : "rotate-[1.5deg]"
        } rounded-md bg-white p-3 pb-14 shadow-[0_40px_80px_rgb(0,0,0,0.5)]`}
      >
        <img
          src={photo.src}
          alt={photo.alt}
          loading="eager"
          decoding="async"
          draggable={false}
          className="h-full w-full select-none rounded-[3px] object-cover"
        />
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.26em] text-neutral-400">
          Roll 03 · Frame {String(1042 + index * 37)} · snap
        </span>
        {/* print back — flashes during the flip */}
        <div className="absolute inset-3 bottom-14 rounded-[3px] bg-neutral-100 [transform:rotateY(180deg)_translateZ(1px)] [backface-visibility:hidden]">
          <div className="grid h-full place-items-center">
            <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-neutral-400">snap · full resolution</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ShutterCounter({ progress }: { progress: MotionValue<number> }) {
  const [n, setN] = useState(0);
  useMotionValueEvent(progress, "change", (v) => {
    setN(Math.round(Math.min(v / 0.84, 1) * 1240));
  });
  return (
    <div className="pointer-events-none absolute right-4 top-[74px] z-30 text-right font-mono text-[10px] uppercase tracking-[0.22em] text-white/75 sm:right-10 sm:top-20 sm:text-[11px]">
      <span className="tabular-nums">{n.toLocaleString()}</span> frames
      <br />
      shot today
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter four — the family, and the first-year strip.                */
/* ------------------------------------------------------------------ */

const YEAR_PRINTS = [
  { photo: FAMILY_FRAMES[1], month: "02" }, // the newborn
  { photo: FAMILY_FRAMES[2], month: "05" }, // tiny feet
  { photo: FAMILY_FRAMES[4], month: "08" }, // pool ring, first birthday
  { photo: FAMILY_FRAMES[5], month: "11" }, // the shoreline walk
  { photo: FAMILY_FRAMES[3], month: "12" }, // her first camera
];

export function FamilyChapter() {
  return (
    <Chapter vh={560}>
      {(progress) => <FamilyScenes progress={progress} />}
    </Chapter>
  );
}

function FamilyScenes({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      <PhotoLayer photo={FAMILY_FRAMES[0]} progress={progress} start={0} end={0.18} push={1.16} fadeOut />
      <PhotoLayer photo={FAMILY_FRAMES[1]} progress={progress} start={0.18} end={0.36} push={1.2} focusPull fadeOut />
      <PhotoLayer photo={FAMILY_FRAMES[2]} progress={progress} start={0.36} end={0.5} push={1.22} focusPull fadeOut />

      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
      <Viewfinder
        progress={progress}
        from={0}
        to={0.5}
        exif={["Bump · ƒ/2 · 1/320", "Newborn · ƒ/1.8 · 1/400", "Feet · ƒ/2.8 · 1/500", "First year"]}
      />
      <ChapterTitles
        progress={progress}
        className="bottom-24 left-6 z-30 sm:bottom-28 sm:left-12"
        windows={[
          {
            start: 0.005,
            end: 0.17,
            node: (
              <>
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/70 sm:text-[11px]">Chapter four</p>
                <h2 className="snap-display text-4xl leading-[1.02] text-white sm:text-6xl">
                  Then there were <em className="italic">three.</em>
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">
                  Maternity. Newborn. First year. The clients who rebook you every
                  twelve months — now in one timeline, not twelve folders.
                </p>
              </>
            ),
          },
          {
            start: 0.53,
            end: 0.99,
            node: (
              <h2 className="snap-display text-3xl leading-[1.05] text-white sm:text-5xl">
                Twelve months. <em className="italic">Twelve frames.</em> One gallery that
                never expires.
              </h2>
            ),
          },
        ]}
      />

      <FirstYearStrip progress={progress} />
    </>
  );
}

/** Horizontal filmstrip scrubbed by vertical scroll — the first year on a contact sheet. */
function FirstYearStrip({ progress }: { progress: MotionValue<number> }) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState(1400);

  useEffect(() => {
    const measure = () => {
      const el = stripRef.current;
      if (!el) return;
      setRange(Math.max(el.scrollWidth - window.innerWidth + 48, 0));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const stripOpacity = useTransform(progress, [0.48, 0.54], [0, 1]);
  const x = useTransform(progress, [0.5, 0.97], [0, -range]);

  return (
    <motion.div style={{ opacity: stripOpacity }} className="absolute inset-x-0 bottom-0 top-[22%] z-10 overflow-hidden">
      <div className="mb-6 flex items-center justify-center gap-3 px-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/70 sm:text-[11px]">
          The first year — month 01 to month 12
        </span>
      </div>
      <motion.div ref={stripRef} style={{ x }} className="flex w-max items-end gap-5 px-8 will-change-transform sm:gap-8">
        {YEAR_PRINTS.map((print, i) => (
          <figure
            key={print.photo.src}
            className={`relative shrink-0 rounded-md bg-white p-2.5 pb-10 shadow-[0_30px_60px_rgb(0,0,0,0.45)] ${
              i % 2 === 0 ? "rotate-[-1.2deg]" : "rotate-[1deg]"
            } ${i === YEAR_PRINTS.length - 1 ? "w-[64vw] max-w-[340px] sm:w-[300px]" : "w-[62vw] max-w-[380px] sm:w-[340px]"}`}
          >
            <img
              src={print.photo.src}
              alt={print.photo.alt}
              loading="eager"
              decoding="async"
              draggable={false}
              className="aspect-[4/5] w-full select-none rounded-[3px] object-cover"
            />
            <figcaption className="absolute mt-2.5 font-mono text-[9px] uppercase tracking-[0.24em] text-neutral-400">
              Month {print.month}
            </figcaption>
          </figure>
        ))}
        <div className="flex w-[70vw] max-w-[360px] shrink-0 flex-col justify-center pb-10 sm:w-[320px]">
          <p className="snap-display text-3xl leading-tight text-white sm:text-4xl">
            One day, she borrows <em className="italic">a camera too.</em>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
