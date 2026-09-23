"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { cn } from "@webcules/ui/lib/utils";

/**
 * FollowingEyes — upload any image, place customizable eyes on it, and the
 * pupils follow the cursor everywhere on the page.
 *
 * Each eye is an SVG layer (white sclera + pupil + shine glint) positioned in
 * % of the image box, so any picture works — mascot, product, selfie — by
 * passing `src` and a pair of `{x, y}` coordinates. Per frame the pupil offset
 * eases toward the pointer vector (exponential approach, frame-rate
 * independent, clamped inside the sclera). Life props: `blink` (seeded,
 * deterministic), `idle="wander"` (the eyes look around seeded points when the
 * pointer is quiet), `shine` (specular glint), `tear` (a drop wells up under
 * an eye on click or while idle, then falls).
 *
 * Pure DOM/SVG with transform-only updates — no canvas, no WebGL, zero runtime
 * dependencies. One RAF (cancelled on unmount, paused on hidden tabs, parked
 * under `prefers-reduced-motion`, where pupils snap to the pointer instead).
 * The eye layer is decorative (`aria-hidden`); the image keeps its `alt`.
 */

export interface EyeSpec {
  /** eye center, % of the image box width */
  x: number;
  /** eye center, % of the image box height */
  y: number;
  /** eye diameter override, % of the image box width */
  size?: number;
  /** pupil/eye diameter ratio override */
  pupilRatio?: number;
  /** constant rotation of the eye assembly, degrees */
  tilt?: number;
}

export interface ShineSpec {
  /** glint radius as a fraction of the pupil radius */
  size?: number;
  /** glint center offset from the pupil center, × pupil radius */
  x?: number;
  y?: number;
}

export interface FollowingEyesProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  /** one entry per eye, in % of the image box */
  eyes?: EyeSpec[];
  /** eye diameter, % of the image box width ("size") */
  eyeSize?: number;
  /** pupil / eye diameter ("pupil size") */
  pupilRatio?: number;
  pupilColor?: string;
  /** the glint on the pupil */
  shine?: boolean | ShineSpec;
  /** teardrop: `true`/`"click"` wells on click, `"idle"` wells while the pointer is quiet */
  tear?: boolean | "click" | "idle";
  /** auto-blink timing, seconds */
  blink?: boolean | { min?: number; max?: number };
  /** `radius` = pupil travel as × eye radius, `stiffness` = per-frame ease (0–1) */
  follow?: { radius?: number; stiffness?: number };
  /** look around when the pointer is absent/quiet */
  idle?: boolean | "wander";
  /** deterministic blink/wander variation — same seed, same life */
  seed?: number;
}

const hash = (i: number, salt: number): number => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const TEAR_FILL = "#7cc6f2";
const TEAR_STROKE = "rgba(38,102,150,0.4)";

export const FollowingEyes = React.forwardRef<HTMLSpanElement, FollowingEyesProps>(
  (
    {
      className,
      src,
      alt,
      eyes,
      eyeSize = 7,
      pupilRatio = 0.55,
      pupilColor = "#141416",
      shine = true,
      tear = "click",
      blink = { min: 2.5, max: 6 },
      follow,
      idle = "wander",
      seed = 1,
      ...rest
    },
    ref,
  ) => {
    const wrapRef = useRef<HTMLSpanElement | null>(null);
    const pupilRefs = useRef<(SVGGElement | null)[]>([]);
    const lidRefs = useRef<(SVGGElement | null)[]>([]);
    const tearRefs = useRef<(SVGGElement | null)[]>([]);
    const [reduced, setReduced] = useState(false);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

    const list: EyeSpec[] =
      eyes && eyes.length > 0
        ? eyes
        : [
            { x: 42, y: 38 },
            { x: 58, y: 38 },
          ];
    const radius = follow?.radius ?? 0.4;
    const stiffness = Math.min(follow?.stiffness ?? 0.14, 0.99);
    const tearMode: "off" | "click" | "idle" = tear === true ? "click" : tear === false ? "off" : tear;
    const blinkOn = blink !== false;
    const blinkMin = (typeof blink === "object" ? blink?.min : undefined) ?? 2.5;
    const blinkMax = (typeof blink === "object" ? blink?.max : undefined) ?? 6;
    const wanderOn = idle === true || idle === "wander";
    const shineSpec: ShineSpec | null =
      shine === false
        ? null
        : typeof shine === "object" && shine !== undefined
          ? { size: shine.size ?? 0.32, x: shine.x ?? -0.3, y: shine.y ?? -0.35 }
          : { size: 0.32, x: -0.3, y: -0.35 };

    // the RAF loop reads the latest props through this ref — no re-subscription on tweaks
    const propsRef = useRef({
      list, eyeSize, pupilRatio, pupilColor, radius, stiffness,
      tearMode, blinkOn, blinkMin, blinkMax, wanderOn, seed, reduced,
    });
    propsRef.current = {
      list, eyeSize, pupilRatio, pupilColor, radius, stiffness,
      tearMode, blinkOn, blinkMin, blinkMax, wanderOn, seed, reduced,
    };

    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;

      let rect = wrap.getBoundingClientRect();
      let raf = 0;
      let running = false;
      let last = performance.now();
      const pointer = { x: 0, y: 0, has: false, at: -1e9 };

      type EyeState = { ox: number; oy: number; wx: number; wy: number; nextWander: number };
      let st: EyeState[] = [];
      const syncState = () => {
        const n = propsRef.current.list.length;
        if (st.length !== n)
          st = Array.from({ length: n }, () => ({ ox: 0, oy: 0, wx: 0, wy: 0, nextWander: 0 }));
      };

      let blinkCount = 0;
      let nextBlink = performance.now() + 1400;
      let blinkStart = -1e9;
      let wanderCount = 0;
      let tearEye = 0;
      let tearIdx = 0;
      let tearStart = -1e9;
      let nextIdleTear = performance.now() + 4500;

      const refresh = () => {
        rect = wrap.getBoundingClientRect();
      };
      const eyeRadiusPx = (i: number) => {
        const p = propsRef.current;
        const e = p.list[i];
        return ((e?.size ?? p.eyeSize) / 100) * Math.max(rect.width, 1) / 2;
      };
      const wanderPick = (i: number, n: number, now: number) => {
        const p = propsRef.current;
        const s = st[i];
        if (!s) return;
        const salt = p.seed * 7 + i * 13;
        const ang = hash(n, salt + 1) * Math.PI * 2;
        // the very first glance stays near center — a settled first frame
        const mag = n === 0 ? 0.22 : 0.35 + 0.6 * hash(n, salt + 2);
        const off = mag * p.radius * eyeRadiusPx(i);
        s.wx = Math.cos(ang) * off;
        s.wy = Math.sin(ang) * off * 0.8;
        s.nextWander = now + 1200 + hash(n, salt + 3) * 2300;
      };
      const spawnTear = () => {
        const p = propsRef.current;
        if (p.tearMode === "off" || tearStart > -1e8) return;
        tearEye = tearIdx++ % Math.max(p.list.length, 1);
        tearStart = performance.now();
      };

      const frame = (now: number) => {
        const p = propsRef.current;
        const dt = Math.min(Math.max((now - last) / 1000, 0.0001), 0.05);
        last = now;
        syncState();
        const n = p.list.length;
        const pointerIdle = !pointer.has || now - pointer.at > 3000;

        // blink: seeded schedule, 1 → ~0 → 1 over 260 ms
        let blinkS = 1;
        if (p.blinkOn) {
          if (now >= nextBlink) {
            blinkStart = now;
            nextBlink = now + (p.blinkMin + (p.blinkMax - p.blinkMin) * hash(blinkCount++, p.seed * 5 + 9)) * 1000;
          }
          const ph = (now - blinkStart) / 260;
          if (ph >= 0 && ph < 1) blinkS = Math.max(0.08, Math.abs(Math.cos(Math.PI * ph)));
        }

        // tear timeline: well (380 ms) then fall (480 ms)
        const tearT = tearStart > -1e8 ? now - tearStart : -1;
        if (tearT > 860) tearStart = -1e9;
        if (p.tearMode === "idle" && pointerIdle && tearStart < -1e8 && now >= nextIdleTear) {
          spawnTear();
          nextIdleTear = now + 6000 + hash(tearIdx, p.seed * 11 + 4) * 6000;
        }

        const a = 1 - Math.pow(1 - p.stiffness, dt * 60);
        for (let i = 0; i < n; i++) {
          const e = p.list[i]!;
          const s = st[i]!;
          const eyePx = ((e.size ?? p.eyeSize) / 100) * Math.max(rect.width, 1);
          const maxOff = eyePx * p.radius;

          if (p.wanderOn && pointerIdle && now >= s.nextWander) wanderPick(i, wanderCount++, now);

          let tx = 0;
          let ty = 0;
          if (!pointerIdle) {
            tx = pointer.x - (rect.left + (e.x / 100) * rect.width);
            ty = pointer.y - (rect.top + (e.y / 100) * rect.height);
            const d = Math.hypot(tx, ty) || 1;
            const m = Math.min(1, maxOff / d);
            tx *= m;
            ty *= m;
          } else if (p.wanderOn) {
            tx = s.wx;
            ty = s.wy;
          }

          s.ox += (tx - s.ox) * a;
          s.oy += (ty - s.oy) * a;

          // px → viewBox units (the eye svg maps its 100×100 box to eyePx square)
          const k = 100 / Math.max(eyePx, 1);
          pupilRefs.current[i]?.setAttribute(
            "transform",
            `translate(${(s.ox * k).toFixed(2)} ${(s.oy * k).toFixed(2)})`,
          );
          const tilt = e.tilt ?? 0;
          lidRefs.current[i]?.setAttribute(
            "transform",
            `translate(0 50) scale(1 ${blinkS.toFixed(3)}) translate(0 -50)${tilt ? ` rotate(${tilt} 50 50)` : ""}`,
          );
        }

        // tear transform on the active eye, hidden on the others
        for (let i = 0; i < n; i++) {
          const g = tearRefs.current[i];
          if (!g) continue;
          if (tearT >= 0 && i === tearEye) {
            const WELL = 380;
            const FALL = 480;
            let sc = 0;
            let ty2 = 0;
            let op = 1;
            if (tearT < WELL) sc = tearT / WELL;
            else {
              const k2 = (tearT - WELL) / FALL;
              ty2 = k2 * k2 * 190;
              op = 1 - k2;
            }
            g.setAttribute(
              "transform",
              `translate(50 82) scale(${Math.max(sc, 0).toFixed(3)}) translate(-50 -82) translate(0 ${ty2.toFixed(1)})`,
            );
            g.setAttribute("opacity", op.toFixed(2));
          } else {
            g.setAttribute("opacity", "0");
          }
        }
      };

      // reduced motion: no loop — pupils snap to the pointer, life props off
      const snap = () => {
        syncState();
        const p = propsRef.current;
        const n = p.list.length;
        for (let i = 0; i < n; i++) {
          const e = p.list[i]!;
          const eyePx = ((e.size ?? p.eyeSize) / 100) * Math.max(rect.width, 1);
          let tx = 0;
          let ty = 0;
          if (pointer.has) {
            tx = pointer.x - (rect.left + (e.x / 100) * rect.width);
            ty = pointer.y - (rect.top + (e.y / 100) * rect.height);
            const maxOff = eyePx * p.radius;
            const d = Math.hypot(tx, ty) || 1;
            const m = Math.min(1, maxOff / d);
            tx *= m;
            ty *= m;
          }
          const k = 100 / Math.max(eyePx, 1);
          pupilRefs.current[i]?.setAttribute("transform", `translate(${(tx * k).toFixed(2)} ${(ty * k).toFixed(2)})`);
          const tilt = e.tilt ?? 0;
          lidRefs.current[i]?.setAttribute(
            "transform",
            tilt ? `rotate(${tilt} 50 50)` : "",
          );
          tearRefs.current[i]?.setAttribute("opacity", "0");
        }
      };

      const tick = (now: number) => {
        if (!running) return;
        frame(now);
        raf = requestAnimationFrame(tick);
      };
      const start = () => {
        if (running || propsRef.current.reduced) return;
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
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.at = performance.now();
        pointer.has = true;
        if (propsRef.current.reduced) snap();
      };
      const onClick = () => {
        if (!propsRef.current.reduced && propsRef.current.tearMode === "click") spawnTear();
      };

      const ro = new ResizeObserver(refresh);
      ro.observe(wrap);
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMq = () => {
        setReduced(mq.matches);
        propsRef.current.reduced = mq.matches;
        if (mq.matches) {
          stop();
          snap();
        } else {
          start();
        }
      };
      onMq();
      mq.addEventListener("change", onMq);
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("click", onClick, { passive: true });
      window.addEventListener("scroll", refresh, { passive: true });
      window.addEventListener("resize", refresh, { passive: true });

      refresh();
      syncState();
      if (propsRef.current.reduced) snap();
      else start();

      return () => {
        stop();
        ro.disconnect();
        mq.removeEventListener("change", onMq);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pointermove", onPointer);
        window.removeEventListener("click", onClick);
        window.removeEventListener("scroll", refresh);
        window.removeEventListener("resize", refresh);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const gradId = `${uid}-sclera`;

    return (
      <span
        ref={(node) => {
          wrapRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn("relative inline-block", className)}
      >
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <radialGradient id={gradId} cx="0.38" cy="0.32" r="0.85">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.72" stopColor="#fdfdfe" />
              <stop offset="1" stopColor="#d9d9e3" />
            </radialGradient>
          </defs>
        </svg>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          {...rest}
          src={src}
          alt={alt}
          draggable={false}
          className="block h-auto w-full max-w-full select-none"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {list.map((e, i) => {
            const pr = (e.pupilRatio ?? pupilRatio) * 47;
            const shine =
              shineSpec !== null
                ? {
                    cx: 50 + shineSpec.x! * pr,
                    cy: 50 + shineSpec.y! * pr,
                    r: Math.max(pr * shineSpec.size!, 0.5),
                  }
                : null;
            return (
              <span
                key={i}
                className="absolute"
                style={{
                  left: `${e.x}%`,
                  top: `${e.y}%`,
                  width: `${e.size ?? eyeSize}%`,
                  aspectRatio: "1 / 1",
                  // inline, not Tailwind: eye geometry must survive hosts whose
                  // content scan doesn't cover this package
                  transform: "translate(-50%, -50%)",
                  filter: "drop-shadow(0 3px 4px rgba(15,15,35,0.28))",
                }}
              >
                <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
                  <g ref={(el) => { lidRefs.current[i] = el; }}>
                    <circle cx="50" cy="50" r="47" fill={`url(#${gradId})`} />
                    <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(20,20,40,0.08)" strokeWidth="2" />
                    <g ref={(el) => { pupilRefs.current[i] = el; }}>
                      <circle cx="50" cy="50" r={pr} fill={pupilColor} />
                      {shine && <circle cx={shine.cx} cy={shine.cy} r={shine.r} fill="#ffffff" opacity="0.95" />}
                    </g>
                    <g ref={(el) => { tearRefs.current[i] = el; }} opacity="0">
                      <path
                        d="M50 64 C 44 74, 41 80, 41 87 A 9 9 0 0 0 59 87 C 59 80, 56 74, 50 64 Z"
                        fill={TEAR_FILL}
                        stroke={TEAR_STROKE}
                        strokeWidth="1.5"
                      />
                    </g>
                  </g>
                </svg>
              </span>
            );
          })}
        </span>
      </span>
    );
  },
);
FollowingEyes.displayName = "FollowingEyes";

export default FollowingEyes;
