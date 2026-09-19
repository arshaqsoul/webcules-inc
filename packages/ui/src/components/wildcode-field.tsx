"use client";

/* ============================================================================
 * <WildcodeField /> — living wordmark: hand-animated canvas scene inside your
 * lettering. Flowers/stars bloom along a paint-beam, vines grow, little
 * critters roam and paint. Pointer is a second paint beam; click for
 * shockwaves. Respects prefers-reduced-motion, pauses offscreen.
 *
 * React never re-renders the canvas — the engine imperatively owns it.
 * Props are forwarded to the engine's imperative API on change.
 * ============================================================================
 */
import { useEffect, useRef } from "react";

import { cn } from "@webcules/ui/lib/utils";

import {
  buildSprites,
  createField,
  type CritterStyle,
  type SpriteSet,
  type WildcodeFieldHandle,
} from "./wildcode-field-engine.js";

export type {
  CritterStyle,
  SpriteSet,
  WildcodeFieldHandle,
} from "./wildcode-field-engine.js";

export type LayerKey = "base" | "glow" | "vine" | "flower" | "drone" | "cursor";

export type WildcodeFieldProps = {
  phrase?: string;
  seed?: number;
  letterColor?: string;
  spriteSet?: SpriteSet;
  critterStyle?: CritterStyle;
  /** false (default): objects may spill past letter edges · true: clipped inside */
  clipFlowers?: boolean;
  /** hovering an object recolors it to a random palette family */
  hoverRecolor?: boolean;
  beamDur?: number;
  holdDur?: number;
  flowerDensity?: number;
  vineCount?: number;
  droneCount?: number;
  sway?: number;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<WildcodeFieldHandle>;
};

export function WildcodeField({
  phrase = "Start today",
  seed,
  letterColor,
  spriteSet,
  critterStyle,
  clipFlowers,
  hoverRecolor,
  beamDur,
  holdDur,
  flowerDensity,
  vineCount,
  droneCount,
  sway,
  ariaLabel,
  className,
  style,
  ref,
}: WildcodeFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<WildcodeFieldHandle | null>(null);

  // create ONCE — the engine takes exclusive ownership of the canvas
  useEffect(() => {
    if (!hostRef.current || !canvasRef.current) return;
    const field = createField(hostRef.current, canvasRef.current, {});
    fieldRef.current = field;
    return () => {
      field.destroy();
      fieldRef.current = null;
    };
  }, []);

  // forward prop changes into the engine imperatively
  useEffect(() => { fieldRef.current?.setPhrase(phrase); }, [phrase]);
  useEffect(() => {
    const cfg: Record<string, unknown> = {};
    if (seed != null) cfg.seed = seed;
    if (letterColor) cfg.letterColor = letterColor;
    if (flowerDensity != null) cfg.flowerDensity = flowerDensity;
    if (vineCount != null) cfg.vineCount = vineCount;
    if (droneCount != null) cfg.droneCount = droneCount;
    if (sway != null) cfg.sway = sway;
    if (beamDur != null) cfg.beamDur = beamDur;
    if (holdDur != null) cfg.holdDur = holdDur;
    if (spriteSet) cfg.spriteSet = spriteSet;
    if (critterStyle) cfg.critterStyle = critterStyle;
    if (clipFlowers != null) cfg.clipFlowers = clipFlowers;
    if (hoverRecolor != null) cfg.hoverRecolor = hoverRecolor;
    if (Object.keys(cfg).length) fieldRef.current?.set(cfg);
  }, [
    seed, letterColor, flowerDensity, vineCount, droneCount, sway,
    beamDur, holdDur, spriteSet, critterStyle, clipFlowers, hoverRecolor,
  ]);

  // imperative handle — assigned via effect to stay typesafe across
  // duplicated @types/react copies in workspaces
  const handle: WildcodeFieldHandle = {
    setPhrase: (p: string) => fieldRef.current?.setPhrase(p),
    set: (c: Record<string, unknown>) => fieldRef.current?.set(c),
    restart: () => fieldRef.current?.restart(),
    pause: (v: boolean) => fieldRef.current?.pause(v),
    layers: (m: Parameters<WildcodeFieldHandle["layers"]>[0]) =>
      fieldRef.current?.layers(m),
    debug: (m: { mask?: boolean; placements?: boolean }) =>
      fieldRef.current?.debug(m),
    destroy: () => fieldRef.current?.destroy(),
  };
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === "function") ref(handle);
    else (ref as { current: WildcodeFieldHandle | null }).current = handle;
  });

  return (
    <div
      ref={hostRef}
      className={cn("relative", className)}
      role="img"
      aria-label={ariaLabel ?? phrase}
      style={{ cursor: "none", ...style }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />
    </div>
  );
}

export { buildSprites };
export default WildcodeField;
