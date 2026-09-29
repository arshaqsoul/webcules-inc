"use client";

import { Check, Lock, MoveRight, Wallet } from "lucide-react";
import { motion, useTransform, type MotionValue } from "framer-motion";

import { Chapter } from "./chapter";
import { ScrubText } from "./text-reveal";

/**
 * The turn: the story becomes the product. One serif sentence lights up
 * word by word while four UI chips — booking, pipeline, gallery, payout —
 * assemble around it. Dips out to white, handing off to the light half.
 */
export function BridgeChapter() {
  return (
    <Chapter vh={260} dipEnd={false}>
      {(progress) => (
        <div className="absolute inset-0 z-10 grid place-items-center overflow-hidden bg-[#0a0b0f]">
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]"
          />

          <ScrubText
            className="snap-display relative z-10 mx-6 max-w-4xl text-balance text-center text-4xl leading-[1.08] text-white sm:text-6xl"
            from={0.14}
            progress={progress}
            range={[0.18, 0.55]}
          >
            Every chapter you just scrolled can be booked, delivered, and paid — through Snap.
          </ScrubText>

          <BridgeChip progress={progress} at={0.55} className="left-[6%] top-[18%] sm:left-[12%]" icon={<Check className="h-3.5 w-3.5" />}>
            Booking · Saturday, 5:00 PM — confirmed
          </BridgeChip>
          <BridgeChip progress={progress} at={0.65} className="right-[6%] top-[30%] sm:right-[14%]" icon={<MoveRight className="h-3.5 w-3.5" />}>
            Pipeline · Moved to Snapping
          </BridgeChip>
          <BridgeChip progress={progress} at={0.75} className="bottom-[26%] left-[8%] sm:left-[16%]" icon={<Lock className="h-3.5 w-3.5" />}>
            Gallery · 87 photos · OTP locked
          </BridgeChip>
          <BridgeChip progress={progress} at={0.85} className="bottom-[14%] right-[8%] sm:right-[18%]" icon={<Wallet className="h-3.5 w-3.5" />}>
            Payout · $1,800 → your Stripe
          </BridgeChip>
        </div>
      )}
    </Chapter>
  );
}

function BridgeChip({
  progress,
  at,
  className,
  icon,
  children,
}: {
  progress: MotionValue<number>;
  at: number;
  className?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const opacity = useTransform(progress, [at, at + 0.07], [0, 1]);
  const y = useTransform(progress, [at, at + 0.07], [24, 0]);
  const scale = useTransform(progress, [at, at + 0.07], [0.92, 1]);
  return (
    <motion.div
      style={{ opacity, y, scale }}
      className={`absolute z-10 flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.07] py-2 pl-2.5 pr-4 text-[11px] font-medium text-white/90 shadow-[0_16px_50px_rgb(0,0,0,0.4)] backdrop-blur-md sm:text-xs ${className ?? ""}`}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/90 text-white">{icon}</span>
      <span className="font-mono uppercase tracking-[0.08em]">{children}</span>
    </motion.div>
  );
}
