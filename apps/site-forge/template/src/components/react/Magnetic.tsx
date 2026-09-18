import { useRef } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";
import type { ReactNode } from "react";

type Props = { children: ReactNode; strength?: number; className?: string };

/** Element leans toward the cursor — use on primary CTAs, sparingly. */
export default function Magnetic({ children, strength = 0.35, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={reduce ? undefined : { x, y, display: "inline-block" }}
      onPointerMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
