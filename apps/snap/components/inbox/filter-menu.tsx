"use client";

/* Inbox filter menu (WEB-306 polish) — Linear's model: a funnel trigger in
 * the toolbar opens an "Add filter" popover listing filter dimensions; the
 * active dimension values render as removable pills beside the trigger.
 * V1 ships the Kind dimension (the API's kind param); Client/Project ride
 * WEB-308's thread↔record linkage. Opened by click or the F key (handled in
 * InboxView's keymap, which owns the open state). */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Filter, X } from "lucide-react";

import { KIND_ICON, type InboxKind } from "@/components/inbox/kinds";

const KIND_OPTIONS: Array<{ id: InboxKind; label: string }> = [
  { id: "email", label: "Emails" },
  { id: "booking", label: "Bookings" },
  { id: "contract", label: "Contracts" },
  { id: "invoice", label: "Payments" },
  { id: "gallery", label: "Galleries" },
  { id: "lead", label: "Inquiries" },
];

export function FilterMenu({
  kind,
  onKind,
  open,
  onOpenChange,
}: {
  kind: InboxKind | null;
  onKind: (k: InboxKind | null) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [kindExpanded, setKindExpanded] = useState(true);

  // Outside click closes (Escape is handled by InboxView's keymap).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  const activeLabel = kind ? KIND_OPTIONS.find((o) => o.id === kind)?.label : null;

  return (
    <div ref={rootRef} className="relative flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={kind !== null}
        title="Filter (F)"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
          kind !== null || open
            ? "bg-primary/10 text-primary"
            : "border border-hairline bg-surface-1 text-ink-subtle hover:bg-surface-2 hover:text-ink"
        }`}
      >
        <Filter className="h-3.5 w-3.5" aria-hidden />
        Filter
      </button>

      {/* Active filter pill — the dimension + its value, removable. */}
      {activeLabel && (
        <span className="flex items-center gap-1 rounded-full border border-hairline bg-surface-1 py-1 pl-2.5 pr-1 text-[13px] text-ink">
          <span className="text-ink-subtle">Kind</span>
          <span className="font-medium">{activeLabel}</span>
          <button
            type="button"
            onClick={() => onKind(null)}
            aria-label={`Clear ${activeLabel} filter`}
            className="rounded-full p-0.5 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      )}

      {open && (
        <div
          role="menu"
          aria-label="Add filter"
          className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-[12px] border border-hairline bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Add filter</span>
            <kbd className="rounded border border-hairline bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-ink-tertiary">F</kbd>
          </div>
          {/* Kind dimension */}
          <button
            type="button"
            role="menuitem"
            aria-expanded={kindExpanded}
            onClick={() => setKindExpanded((v) => !v)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-2"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-2 text-ink-subtle">
              <ChevronRight className={`h-3 w-3 transition-transform ${kindExpanded ? "rotate-90" : ""}`} aria-hidden />
            </span>
            Kind
            <span className="ml-auto text-xs text-ink-tertiary">{activeLabel ?? "Any"}</span>
          </button>
          {kindExpanded && (
            <div className="border-t border-hairline pb-1">
              {KIND_OPTIONS.map((o) => {
                const Icon = KIND_ICON[o.id];
                const active = kind === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={active}
                    onClick={() => {
                      onKind(active ? null : o.id);
                      onOpenChange(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 pl-9 text-left text-[13px] transition-colors hover:bg-surface-2 ${
                      active ? "font-medium text-ink" : "text-ink-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
                    {o.label}
                    {active && <Check className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
