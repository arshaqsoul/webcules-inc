"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Lenis smooth scrolling for the cinematic landing only - inert when the
 * visitor prefers reduced motion (native scroll stays untouched there).
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.11, autoRaf: true });
    return () => lenis.destroy();
  }, []);

  return <>{children}</>;
}
