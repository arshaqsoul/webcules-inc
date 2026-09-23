"use client";

/* The playground toolbox: one control per configurable prop of the selected
 * component, grouped by theme. Fully controlled — the workbench owns the
 * values so the preview updates in realtime. Rendered as the left column on
 * xl screens and as a collapsible panel above the preview on smaller ones. */
import { RotateCcw } from "lucide-react";

import { cn } from "@webcules/ui/lib/utils";
import { Checkbox } from "@webcules/ui/components/checkbox";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@webcules/ui/components/select";

import type { ConfigValues } from "@/lib/saved-configs";
import { groupsOf, type PropSpec, type RegistryEntry } from "@/components/library/registry";

function PropControl({
  spec,
  value,
  modified,
  onChange,
}: {
  spec: PropSpec;
  value: ConfigValues[string];
  modified: boolean;
  onChange: (v: ConfigValues[string]) => void;
}) {
  const id = `tb-${spec.prop}`;

  return (
    <div className="group/ctrl">
      <div className="mb-1.5 flex items-center gap-2">
        <Label htmlFor={id} className="text-xs text-white/60">
          {spec.label}
        </Label>
        {modified ? (
          <button
            type="button"
            aria-label={`Reset ${spec.label} to default`}
            onClick={() => onChange(spec.default)}
            className="ml-auto flex items-center gap-1 text-[10px] text-violet-300/80 opacity-0 transition-opacity group-hover/ctrl:opacity-100 hover:text-violet-200"
          >
            <RotateCcw className="size-2.5" /> reset
          </button>
        ) : null}
      </div>

      {spec.control.kind === "text" ? (
        <Input
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 border-white/10 bg-white/5 text-xs"
        />
      ) : null}

      {spec.control.kind === "color" ? (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="color"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded-md border border-white/20 bg-transparent p-0.5"
            aria-label={spec.label}
          />
          <span className="font-mono text-xs uppercase text-white/50">
            {String(value)}
          </span>
        </div>
      ) : null}

      {spec.control.kind === "colors" ? (
        <ColorsControl label={spec.label} value={String(value)} onChange={onChange} />
      ) : null}

      {spec.control.kind === "select" ? (
        <Select value={String(value)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger
            id={id}
            className="h-8 border-white/10 bg-white/5 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.control.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {spec.control.kind === "slider" ? (
        <div className="flex items-center gap-2.5">
          <input
            id={id}
            type="range"
            min={spec.control.min}
            max={spec.control.max}
            step={spec.control.step}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ accentColor: "#8b5cf6" }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded bg-white/15"
          />
          <span className="w-10 text-right font-mono text-xs text-white/60">
            {Number(value).toFixed(spec.control.step < 0.1 ? 2 : 1)}
          </span>
        </div>
      ) : null}

      {spec.control.kind === "boolean" ? (
        <div className="flex items-center gap-2 pt-0.5">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(v) => onChange(v === true)}
          />
          <span className="font-mono text-[11px] text-white/40">
            {String(value)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

const COLORS_MIN = 2;
const COLORS_MAX = 4;
const COLORS_ADD = "#94a3b8";

/** Multi-stop color picker: a row of native color inputs; × removes a stop
 * (min 2), + appends one (max 4). The value stays a comma-separated string. */
function ColorsControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: ConfigValues[string]) => void;
}) {
  const stops = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="flex items-start gap-2 pt-0.5">
      {stops.map((c, i) => (
        // stable key: a value-derived key would remount the input on every live
        // input event and slam the OS color chooser shut mid-pick
        <div key={i} className="group/chip relative">
          <input
            type="color"
            aria-label={`${label} — stop ${i + 1}`}
            value={/^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"}
            onChange={(e) =>
              onChange(stops.map((s, j) => (j === i ? e.target.value : s)).join(","))
            }
            className="size-7 cursor-pointer rounded-md border border-white/20 bg-transparent p-0.5"
          />
          {stops.length > COLORS_MIN ? (
            <button
              type="button"
              aria-label={`${label} — remove stop ${i + 1}`}
              onClick={() =>
                onChange(stops.filter((_, j) => j !== i).join(","))
              }
              className="absolute -right-1.5 -top-1.5 hidden size-4 items-center justify-center rounded-full border border-white/20 bg-[#15152e] text-[10px] leading-none text-white/70 group-hover/chip:flex hover:text-white"
            >
              ×
            </button>
          ) : null}
          <p className="mt-0.5 text-center font-mono text-[9px] uppercase text-white/40">
            {c}
          </p>
        </div>
      ))}
      {stops.length < COLORS_MAX ? (
        <button
          type="button"
          aria-label={`${label} — add stop`}
          onClick={() => onChange([...stops, COLORS_ADD].join(","))}
          className="mt-0.5 flex size-7 items-center justify-center rounded-md border border-dashed border-white/25 text-white/50 transition-colors hover:border-white/50 hover:text-white"
        >
          +
        </button>
      ) : null}
    </div>
  );
}

export function Toolbox({
  entry,
  values,
  onChange,
  onReset,
  className,
  hideHeading,
}: {
  entry: RegistryEntry;
  values: ConfigValues;
  onChange: (prop: string, v: ConfigValues[string]) => void;
  onReset: () => void;
  className?: string;
  /** The drawer renders its own header with a close button. */
  hideHeading?: boolean;
}) {
  const groups = groupsOf(entry);
  const modifiedCount = entry.props.filter(
    (p) => values[p.prop] !== undefined && values[p.prop] !== p.default,
  ).length;

  return (
    <div className={cn("flex flex-col", className)}>
      {!hideHeading ? (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-white/35">
            Toolbox
          </p>
          <button
            type="button"
            onClick={onReset}
            disabled={modifiedCount === 0}
            className="flex items-center gap-1.5 text-xs text-white/50 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <RotateCcw className="size-3" />
            Reset{modifiedCount ? ` (${modifiedCount})` : ""}
          </button>
        </div>
      ) : null}

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-white/30">
              {g.group}
            </p>
            <div className="space-y-4">
              {g.props.map((p) => (
                <PropControl
                  key={p.prop}
                  spec={p}
                  value={values[p.prop] ?? p.default}
                  modified={values[p.prop] !== undefined && values[p.prop] !== p.default}
                  onChange={(v) => onChange(p.prop, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
