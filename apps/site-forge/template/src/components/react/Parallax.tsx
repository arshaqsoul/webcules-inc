import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** px to drift over the element's full scroll; negative moves up */
  range?: number;
  className?: string;
};

/** Subtle vertical parallax tied to the element's own scroll progress. */
export default function Parallax({ children, range = -80, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [Math.round(-range / 2), range]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}
