"use client";

import { useEffect } from "react";
import { useMotionValue, useSpring, type MotionValue } from "framer-motion";

/**
 * Pointer parallax: spring-smoothed x/y offsets (px) that follow the cursor
 * around the viewport center. Desktop fine pointers only, and inert under
 * prefers-reduced-motion — values simply stay at 0.
 */
export function useMouseParallax(strength: number): {
  x: MotionValue<number>;
  y: MotionValue<number>;
} {
  const x = useSpring(useMotionValue(0), { stiffness: 55, damping: 18, mass: 0.6 });
  const y = useSpring(useMotionValue(0), { stiffness: 55, damping: 18, mass: 0.6 });

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2; // -1 … 1
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      x.set(nx * strength);
      y.set(ny * strength);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [strength, x, y]);

  return { x, y };
}
