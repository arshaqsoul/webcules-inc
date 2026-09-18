import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  delay?: number;
  y?: number;
  blur?: boolean;
  once?: boolean;
  className?: string;
};

/** Fade + rise (+ optional blur) when scrolled into view. The one reveal primitive. */
export default function Reveal({ children, delay = 0, y = 28, blur = true, once = true, className }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, ...(blur ? { filter: "blur(8px)" } : {}) }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-72px" }}
      transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
