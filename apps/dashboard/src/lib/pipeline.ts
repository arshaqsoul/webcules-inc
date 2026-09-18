import type { Stage } from "@/db/schema";

export const STAGES: { id: Stage; label: string; hint: string; color: string }[] = [
  { id: "lead", label: "Lead", hint: "spotted, not built yet", color: "bg-zinc-400" },
  { id: "redesigned", label: "Redesigned", hint: "preview ready, not pitched", color: "bg-sky-500" },
  { id: "contacted", label: "Contacted", hint: "pitch sent, waiting", color: "bg-indigo-500" },
  { id: "negotiating", label: "Negotiating", hint: "they replied", color: "bg-amber-500" },
  { id: "won", label: "Won", hint: "paid, launching", color: "bg-emerald-500" },
  { id: "live", label: "Live", hint: "on their domain + maintenance", color: "bg-teal-600" },
  { id: "lost", label: "Lost / parked", hint: "not now", color: "bg-zinc-300" },
];

export function stageMeta(s: Stage) {
  return STAGES.find((x) => x.id === s) ?? (STAGES[0] as (typeof STAGES)[number]);
}

export function nextStage(s: Stage): Stage | null {
  const order: Stage[] = ["lead", "redesigned", "contacted", "negotiating", "won", "live"];
  const i = order.indexOf(s);
  if (i === -1 || i === order.length - 1) return null;
  return order[i + 1] ?? null;
}
