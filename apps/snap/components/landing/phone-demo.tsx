"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownToLine, Heart, Lock } from "lucide-react";

import { Phone, Scaled, useLoop } from "./device";

const SHOTS = [
  { src: "wedding-couple.jpg", h: 250 },
  { src: "wedding-sparkler.jpg", h: 190 },
  { src: "wedding-bouquet.jpg", h: 200 },
  { src: "wedding-dance.jpg", h: 260 },
  { src: "wedding-veil.jpg", h: 240 },
  { src: "wedding-rings.jpg", h: 190 },
  { src: "wedding-field.jpg", h: 210 },
  { src: "wedding-table.jpg", h: 230 },
];

/** What the CLIENT sees: a branded gallery on their phone, with favorites. */
function GalleryScreen({
  favs,
  onToggle,
  unlocked,
  cursor,
}: {
  favs: Set<number>;
  onToggle?: (i: number) => void;
  unlocked: boolean;
  /** Index of the shot being auto-hearted (hero loop). */
  cursor?: number;
}) {
  const cols: (typeof SHOTS)[number][][] = [[], []];
  const idx: number[][] = [[], []];
  SHOTS.forEach((s, i) => {
    cols[i % 2]!.push(s);
    idx[i % 2]!.push(i);
  });
  return (
    <div className="relative h-[780px] w-[360px] bg-background text-ink">
      <div className="h-11" />
      <div className="px-4 pb-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-tertiary">Willow &amp; Pine Photo</div>
        <div className="snap-display mt-1 text-[30px] leading-none">Maya &amp; Jon</div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-subtle">
          <span>212 photos</span>
          <span className="h-1 w-1 rounded-full bg-ink-tertiary" />
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3 fill-[#e5484d] text-[#e5484d]" />
            {favs.size}
          </span>
        </div>
      </div>
      <div className="relative flex gap-1.5 px-3">
        {cols.map((col, c) => (
          <div key={c} className="flex flex-1 flex-col gap-1.5">
            {col.map((s, r) => {
              const i = idx[c]![r]!;
              const on = favs.has(i);
              return (
                <button
                  key={s.src}
                  type="button"
                  aria-label={on ? "Remove favorite" : "Favorite this photo"}
                  onClick={() => onToggle?.(i)}
                  disabled={!onToggle}
                  className={`relative block w-full overflow-hidden rounded-md bg-surface-2 ${onToggle ? "cursor-pointer" : "cursor-default"}`}
                  style={{ height: s.h }}
                >
                  <img src={`/imgs/landing/t/${s.src}`} alt="" draggable={false} loading="eager" className="h-full w-full object-cover" />
                  <motion.span
                    animate={{ scale: on ? [0.4, 1.3, 1] : 1 }}
                    transition={{ duration: 0.4 }}
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/35 backdrop-blur"
                  >
                    <Heart className={`h-3.5 w-3.5 ${on ? "fill-[#ff5a60] text-[#ff5a60]" : "text-white"}`} />
                  </motion.span>
                  {cursor === i && (
                    <span aria-hidden className="absolute inset-0 rounded-md ring-2 ring-white/70" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-hairline bg-background/90 px-4 pb-6 pt-3 backdrop-blur">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
          <Lock className="h-3 w-3" /> Private link
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium ${unlocked ? "bg-primary text-white" : "bg-surface-3 text-ink-subtle"}`}>
          <ArrowDownToLine className="h-3.5 w-3.5" /> Download all
        </div>
      </div>
    </div>
  );
}

/** Hero companion - plays itself. */
export function PhoneAuto({ className = "" }: { className?: string }) {
  const { ref, step } = useLoop(12, 900);
  const order = [0, 2, 3, 5, 6];
  const fired = Math.floor(step / 2);
  const favs = new Set(order.slice(0, step >= 10 ? 0 : fired));
  const cursor = step < 10 && step % 2 === 1 ? order[fired] : undefined;
  return (
    <div ref={ref} className={className}>
      <Phone>
        <Scaled w={360} h={780}>
          <GalleryScreen favs={favs} unlocked={step >= 8 && step < 10} cursor={cursor} />
        </Scaled>
      </Phone>
    </div>
  );
}

/** Tappable for real - the section that makes visitors play with the product. */
export function PhoneInteractive({ className = "", onCount }: { className?: string; onCount?: (n: number) => void }) {
  const [favs, setFavs] = useState<Set<number>>(() => new Set([1]));
  const [hint, setHint] = useState(true);
  useEffect(() => {
    if (favs.size > 1) setHint(false);
    onCount?.(favs.size);
  }, [favs, onCount]);
  const toggle = (i: number) =>
    setFavs((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <div className={`relative ${className}`}>
      <Phone>
        <Scaled w={360} h={780}>
          <GalleryScreen favs={favs} onToggle={toggle} unlocked />
        </Scaled>
      </Phone>
      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="pointer-events-none absolute -right-2 top-[30%] z-30 rotate-3 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#12141c] shadow-xl sm:-right-14"
          >
            Tap a photo to heart it
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
