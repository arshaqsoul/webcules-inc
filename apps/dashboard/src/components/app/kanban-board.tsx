"use client";

import { ChevronRight, Globe, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StageBadge } from "@/components/app/stage-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Stage } from "@/db/schema";
import { STAGES, nextStage } from "@/lib/pipeline";
import { setStage } from "@/app/actions";
import { cad } from "@/lib/utils";

export type KanbanRow = {
  id: string;
  business: string;
  industry: string;
  stage: Stage;
  quote: number | null;
  previewUrl: string;
  days: number | null;
};

export function KanbanBoard({ rows }: { rows: KanbanRow[] }) {
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(rows);

  function move(id: string, stage: Stage) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, stage } : r)));
    startTransition(async () => {
      try {
        await setStage(id, stage);
        toast.success(`Moved to ${STAGES.find((s) => s.id === stage)?.label}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Move failed");
        setItems(rows);
      }
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((stage) => {
        const cards = items.filter((r) => r.stage === stage.id);
        return (
          <div key={stage.id} id={stage.id} className="flex min-w-0 flex-col rounded-xl border bg-secondary/40 p-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${stage.color}`} />
                <span className="text-sm font-medium">{stage.label}</span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{cards.length}</span>
            </div>
            <div className="flex min-h-16 flex-col gap-2">
              {cards.length === 0 && <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{stage.hint}</div>}
              {cards.map((card) => {
                const next = nextStage(card.stage);
                return (
                  <div key={card.id} className="group rounded-lg border bg-card p-2.5 shadow-xs">
                    <div className="flex items-start justify-between gap-1">
                      <Link href={`/leads/${card.id}`} className="min-w-0 flex-1 text-sm font-medium hover:underline">
                        <span className="block truncate">{card.business}</span>
                        {card.industry && <span className="block truncate text-xs font-normal text-muted-foreground">{card.industry}</span>}
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-6 shrink-0">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          {STAGES.filter((s) => s.id !== card.stage).map((s) => (
                            <DropdownMenuItem key={s.id} onClick={() => move(card.id, s.id)}>
                              <span className={`size-2 rounded-full ${s.color}`} />
                              {s.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/leads/${card.id}`}>Open detail</Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {card.previewUrl && (
                          <a href={card.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-primary" title={card.previewUrl}>
                            <Globe className="size-3" /> preview
                          </a>
                        )}
                        {card.days !== null && <span>· {card.days}d since touch</span>}
                      </div>
                      {card.quote !== null && <span className="text-xs font-semibold tabular-nums">{cad(card.quote)}</span>}
                    </div>
                    {next && (
                      <Button variant="ghost" size="sm" className="mt-1.5 h-7 w-full justify-between px-2 text-xs" onClick={() => move(card.id, next)}>
                        Advance to {STAGES.find((s) => s.id === next)?.label}
                        <ChevronRight />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
