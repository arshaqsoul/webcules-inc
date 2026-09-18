import type { Stage } from "@/db/schema";
import { stageMeta } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const VARIANTS: Record<string, string> = {
  lead: "bg-zinc-100 text-zinc-600",
  redesigned: "bg-sky-100 text-sky-800",
  contacted: "bg-indigo-100 text-indigo-800",
  negotiating: "bg-amber-100 text-amber-800",
  won: "bg-emerald-100 text-emerald-800",
  live: "bg-teal-100 text-teal-800",
  lost: "bg-zinc-100 text-zinc-400",
};

export function StageBadge({ stage }: { stage: Stage }) {
  const meta = stageMeta(stage);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", VARIANTS[stage] ?? VARIANTS.lead)}>
      <span className={cn("size-1.5 rounded-full", meta.color)} />
      {meta.label}
    </span>
  );
}
