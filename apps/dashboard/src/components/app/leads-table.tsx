"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { LeadFormDialog } from "@/components/app/lead-form-dialog";
import { StageBadge } from "@/components/app/stage-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Stage } from "@/db/schema";
import { STAGES } from "@/lib/pipeline";
import { cad } from "@/lib/utils";

export type LeadRow = {
  id: string;
  business: string;
  industry: string;
  siteUrl: string;
  contact: string;
  stage: Stage;
  quote: number | null;
  days: number | null;
  createdAt: number | null;
};

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (stage === "all" || r.stage === stage) &&
          (q === "" || `${r.business} ${r.industry} ${r.contact} ${r.siteUrl}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, q, stage],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, industry, contact…" className="pl-8" />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <LeadFormDialog open={open} onOpenChange={setOpen} trigger={<Button><Plus /> Add lead</Button>} />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Business</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Last touch</TableHead>
              <TableHead className="pr-4">Site</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No leads yet — add the first Saskatoon business, or import a forge redesign.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-4">
                  <Link href={`/leads/${r.id}`} className="font-medium hover:underline">
                    {r.business}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {r.industry}
                    {r.contact ? ` · ${r.contact}` : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <StageBadge stage={r.stage} />
                </TableCell>
                <TableCell className="tabular-nums">{r.quote !== null ? cad(r.quote) : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.days === null ? "never" : r.days === 0 ? "today" : `${r.days}d ago`}</TableCell>
                <TableCell className="pr-4">
                  {r.siteUrl ? (
                    <a href={r.siteUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary hover:underline">
                      {r.siteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
