import { motion, useScroll, useSpring } from "motion/react";

/** Thin acid progress bar pinned to the top of the viewport. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.3 });
  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-90 h-0.5 origin-left bg-acid"
      style={{ scaleX }}
    />
  );
}
