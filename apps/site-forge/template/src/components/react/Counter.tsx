import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

type Props = {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
};

/** Counts up when it enters the viewport. Value 0 counts nowhere — used as a plain "0". */
export default function Counter({ value, suffix = "", prefix = "", duration = 1.4, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || reduce || value === 0) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
