"use client";

import { useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Checkbox } from "@webcules/ui/components/checkbox";
import { Label } from "@webcules/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@webcules/ui/components/select";
import {
  WildcodeField,
  type CritterStyle,
  type SpriteSet,
  type WildcodeFieldHandle,
} from "@webcules/ui/components/wildcode-field";

const SPRITE_SETS: { value: SpriteSet; label: string }[] = [
  { value: "flowers", label: "Flowers" },
  { value: "stars", label: "Stars" },
  { value: "bubbles", label: "Bubbles" },
  { value: "hearts", label: "Hearts" },
];
const CRITTER_STYLES: { value: CritterStyle; label: string }[] = [
  { value: "drone", label: "Drones" },
  { value: "bee", label: "Bees" },
  { value: "ghost", label: "Ghosts" },
];

export function WildcodePlayground() {
  const ref = useRef<WildcodeFieldHandle>(null);
  const [spriteSet, setSpriteSet] = useState<SpriteSet>("flowers");
  const [critterStyle, setCritterStyle] = useState<CritterStyle>("drone");
  const [letterColor, setLetterColor] = useState("#5839a8");
  const [clip, setClip] = useState(false);
  const [recolor, setRecolor] = useState(true);

  return (
    <div className="space-y-4">
      <WildcodeField
        ref={ref}
        phrase="Start today"
        spriteSet={spriteSet}
        critterStyle={critterStyle}
        clipFlowers={clip}
        hoverRecolor={recolor}
        letterColor={letterColor}
        className="overflow-hidden rounded-2xl border border-white/10"
        style={{
          background: "linear-gradient(180deg,#fdfaf6 0%,#f4eef9 100%)",
        }}
      />

      <div className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Label className="text-xs text-white/50">objects</Label>
          <Select
            value={spriteSet}
            onValueChange={(v) => setSpriteSet(v as SpriteSet)}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPRITE_SETS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2.5">
          <Label className="text-xs text-white/50">critters</Label>
          <Select
            value={critterStyle}
            onValueChange={(v) => setCritterStyle(v as CritterStyle)}
          >
            <SelectTrigger className="h-8 w-[105px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITTER_STYLES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2.5">
          <Label className="text-xs text-white/50">letters</Label>
          <input
            type="color"
            value={letterColor}
            onChange={(e) => setLetterColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-white/20 bg-transparent"
            aria-label="Letter color"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="wc-clip"
            checked={clip}
            onCheckedChange={(v) => setClip(v === true)}
          />
          <Label htmlFor="wc-clip" className="text-xs text-white/70">
            clip objects inside letters
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="wc-recolor"
            checked={recolor}
            onCheckedChange={(v) => setRecolor(v === true)}
          />
          <Label htmlFor="wc-recolor" className="text-xs text-white/70">
            hover recolors
          </Label>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={() => ref.current?.restart()}
        >
          Restart cycle
        </Button>
      </div>

      <p className="text-xs text-white/40">
        Move your pointer across the wordmark — it acts as a second paint beam.
        Click for shockwaves. The cycle runs GROW → HOLD → RETRACT → REST.
      </p>
    </div>
  );
}
