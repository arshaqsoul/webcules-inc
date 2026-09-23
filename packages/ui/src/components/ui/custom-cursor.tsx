"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@webcules/ui/lib/utils";

/**
 * CustomCursor — an oversized eased cursor that follows the real pointer,
 * mascot-hero style: a big outlined arrow (or dot / ring) trailing the pointer
 * with a smooth exponential lag while the native cursor is hidden.
 *
 * Render nothing on coarse pointers (touch has no cursor to replace). Under
 * `prefers-reduced-motion` the follower snaps to the pointer instead of
 * easing. Decorative (`aria-hidden`, pointer-events: none), transform-only
 * updates, one RAF (cancelled on unmount, paused on hidden tabs), zero runtime
 * dependencies. Pairs with FollowingEyes for the full living-mascot hero.
 */

export interface CustomCursorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** arrow = classic pointer (the mascot-hero look), dot / ring = minimal markers */
  variant?: "arrow" | "dot" | "ring";
  /** cursor height in px (width matches) */
  size?: number;
  /** fill / stroke color of the shape */
  color?: string;
  /** outline color behind the shape (arrow only) */
  outline?: string;
  /** per-frame ease toward the pointer (0–1); lower = laggier */
  stiffness?: number;
  /** hide the native cursor while mounted (document-level `cursor: none`) */
  hideNative?: boolean;
  /** scale applied while the pointer is pressed; 1 = off */
  pressScale?: number;
}

const ARROW_PATH = "M5 2 L5 20 L9.4 16.4 L11.9 21.8 L14.9 20.4 L12.4 15.2 L17.8 15 Z";

export const CustomCursor = React.forwardRef<HTMLDivElement, CustomCursorProps>(
  (
    {
      className,
      variant = "arrow",
      size = 44,
      color = "#4b4b57",
      outline = "#ffffff",
      stiffness = 0.22,
      hideNative = true,
      pressScale = 0.85,
      ...rest
    },
    ref,
  ) => {
    const elRef = useRef<HTMLDivElement | null>(null);
    const [fine, setFine] = useState(false);

    const propsRef = useRef({ variant, size, color, outline, stiffness, pressScale });
    propsRef.current = { variant, size, color, outline, stiffness, pressScale };

    useEffect(() => {
      const el = elRef.current;
      const mq = window.matchMedia("(pointer: fine)");
      const rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMq = () => setFine(mq.matches);
      onMq();
      mq.addEventListener("change", onMq);
      if (!el || !mq.matches) return () => mq.removeEventListener("change", onMq);

      let raf = 0;
      let running = false;
      let last = performance.now();
      const pos = { x: -200, y: -200, tx: -200, ty: -200, sc: 1, tsc: 1 };
      let prevCursor: string | null = null;

      const apply = (snap: boolean, dtMs: number) => {
        const p = propsRef.current;
        const a = snap ? 1 : 1 - Math.pow(1 - Math.min(p.stiffness, 0.99), (dtMs / 1000) * 60);
        pos.x += (pos.tx - pos.x) * a;
        pos.y += (pos.ty - pos.y) * a;
        pos.sc += (pos.tsc - pos.sc) * (snap ? 1 : Math.min(1, a * 1.6));
        const half = p.size / 2;
        el.style.transform = `translate3d(${(pos.x - half).toFixed(1)}px, ${(pos.y - half).toFixed(1)}px, 0)${p.variant === "arrow" ? " rotate(-8deg)" : ""} scale(${pos.sc.toFixed(3)})`;
      };

      const tick = (now: number) => {
        if (!running) return;
        const dt = Math.min(now - last, 50);
        last = now;
        apply(false, Math.max(dt, 1));
        raf = requestAnimationFrame(tick);
      };
      const start = () => {
        if (running || rmq.matches) return;
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };
      const onVis = () => (document.hidden ? stop() : start());

      const onPointer = (e: PointerEvent) => {
        pos.tx = e.clientX;
        pos.ty = e.clientY;
        if (rmq.matches) apply(true, 0);
      };
      const onDown = () => (pos.tsc = propsRef.current.pressScale);
      const onUp = () => (pos.tsc = 1);

      if (hideNative) {
        prevCursor = document.documentElement.style.cursor;
        document.documentElement.style.cursor = "none";
      }
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      rmq.addEventListener("change", onVis);
      start();

      return () => {
        stop();
        mq.removeEventListener("change", onMq);
        rmq.removeEventListener("change", onVis);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pointermove", onPointer);
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
        if (prevCursor !== null) document.documentElement.style.cursor = prevCursor;
      };
    }, [hideNative]);

    const shape =
      variant === "arrow" ? (
        <path d={ARROW_PATH} fill={color} stroke={outline} strokeWidth="1.7" strokeLinejoin="round" />
      ) : variant === "dot" ? (
        <circle cx="12" cy="12" r="5.5" fill={color} />
      ) : (
        <circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="2.4" />
      );

    // always mounted so the effect can capture the node — merely hidden when the
    // device has no fine pointer (there is nothing to replace on touch)
    return (
      <div
        {...rest}
        ref={(node) => {
          elRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        aria-hidden="true"
        className={cn("pointer-events-none fixed left-0 top-0 z-[9999] will-change-transform", className)}
        style={{
          width: size,
          height: size,
          filter: "drop-shadow(0 4px 6px rgba(15,15,35,0.35))",
          visibility: fine ? "visible" : "hidden",
          ...rest.style,
        }}
      >
        <svg viewBox="0 0 24 24" className="h-full w-full overflow-visible">
          {shape}
        </svg>
      </div>
    );
  },
);
CustomCursor.displayName = "CustomCursor";

export default CustomCursor;
