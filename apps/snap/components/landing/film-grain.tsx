"use client";

import { useEffect, useRef } from "react";

/**
 * Animated film grain over the whole landing — the cheapest way to make
 * photography feel analog. A tiny offscreen noise tile is redrawn a few
 * times a second and repeated via CSS, so the canvas never exceeds 160×160.
 * Static single draw under prefers-reduced-motion.
 */
export function FilmGrain() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 256;
    canvas.width = size;
    canvas.height = size;

    let raf = 0;
    let last = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (t: number) => {
      const image = ctx.createImageData(size, size);
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = (Math.random() * 255) | 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      if (!reduced && t - last < 130) {
        raf = requestAnimationFrame(draw);
      } else if (!reduced) {
        last = t;
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] h-full w-full opacity-[0.04]"
    />
  );
}
