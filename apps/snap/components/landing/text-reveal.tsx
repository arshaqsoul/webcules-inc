"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * Linear's signature scrub: words brighten from ghost to ink as the section
 * scrolls through the viewport. Each word owns a slice of the progress range;
 * a child component keeps the hook-per-word rule honest.
 *
 * Inside a PINNED stage the element's viewport position never changes, so the
 * self-measuring mode freezes — pass `progress` (the stage's scrollYProgress)
 * and `range` instead.
 */
export function ScrubText({
  children,
  className,
  from = 0.15,
  progress: externalProgress,
  range = [0.25, 0.6],
}: {
  children: string;
  className?: string;
  /** Ghost opacity before a word is lit. */
  from?: number;
  progress?: MotionValue<number>;
  range?: [number, number];
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const measured = useScroll({
    target: ref,
    offset: ["start 0.85", "start 0.3"],
  });
  const scrollYProgress = externalProgress ?? measured.scrollYProgress;
  const words = children.split(" ");

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <ScrubWord
          key={`${word}-${i}`}
          progress={scrollYProgress}
          range={[
            range[0] + ((range[1] - range[0]) * i) / words.length,
            range[0] + ((range[1] - range[0]) * (i + 1)) / words.length,
          ]}
          from={from}
        >
          {word}
        </ScrubWord>
      ))}
    </p>
  );
}

function ScrubWord({
  children,
  progress,
  range,
  from,
}: {
  children: ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  from: number;
}) {
  const opacity = useTransform(progress, range, [from, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {children}
      {"\u00A0"}
    </motion.span>
  );
}

/** Fade-up reveal for section headers entering the viewport. */
export function FadeUp({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
