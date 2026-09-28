"use client";

/* Studio switcher (WEB-217) — one login, multiple studios. Switching sets
 * the Better Auth active organization (the dashboard re-scopes to it);
 * "Add studio" creates a fresh org inside the family (tier-gated server
 * side); "Link" adopts a standalone org the user already owns. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export type SwitcherStudio = {
  organizationId: string;
  name: string;
  role: string;
  parentOrganizationId: string | null;
};

export function StudioSwitcher({
  studios,
  currentOrganizationId,
  rootOrganizationId,
  familyStudioCount,
  maxLinkedStudios,
}: {
  studios: SwitcherStudio[];
  currentOrganizationId: string;
  rootOrganizationId: string;
  familyStudioCount: number;
  maxLinkedStudios: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const current = studios.find((s) => s.organizationId === currentOrganizationId);
  const familyIds = new Set([
    rootOrganizationId,
    ...studios.filter((s) => s.parentOrganizationId === rootOrganizationId).map((s) => s.organizationId),
  ]);
  const familyStudios = studios.filter((s) => familyIds.has(s.organizationId));
  const linkable = studios.filter((s) => !s.parentOrganizationId && !familyIds.has(s.organizationId));
  const atLimit = maxLinkedStudios !== null && familyStudioCount >= maxLinkedStudios;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function switchTo(organizationId: string) {
    if (organizationId === currentOrganizationId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    // Hard navigation after the active-org cookie lands — a soft router
    // push can serve a prefetched RSC payload scoped to the OLD studio.
    await authClient.organization.setActive({ organizationId });
    window.location.assign("/dashboard");
  }

  async function addStudio() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      const body = (await res.json().catch(() => ({}))) as { organizationId?: string; error?: string };
      if (!res.ok) {
        setError(
          body.error === "studio_limit"
            ? `Studio limit reached (${maxLinkedStudios} on this plan) — upgrade for more.`
            : body.error === "invalid_name"
              ? "Pick a name (2–80 characters)."
              : "Couldn't create the studio — try again.",
        );
      } else if (body.organizationId) {
        setName("");
        setAdding(false);
        setOpen(false);
        await authClient.organization.setActive({ organizationId: body.organizationId });
        window.location.assign("/dashboard");
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function linkStudio(organizationId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/studios/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error === "studio_limit" ? `Studio limit reached (${maxLinkedStudios} on this plan).` : "Couldn't link that studio.");
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
        title="Switch studio"
      >
        <span aria-hidden className="inline-block h-4 w-4 shrink-0 rounded-[4px] bg-primary" />
        <span className="truncate text-sm font-medium text-ink">{current?.name ?? "Studio"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-[10px] border border-hairline bg-surface-1 p-1 shadow-lg" role="listbox" aria-label="Studios">
          {familyStudios.map((s) => (
            <button
              key={s.organizationId}
              type="button"
              role="option"
              aria-selected={s.organizationId === currentOrganizationId}
              disabled={busy}
              onClick={() => void switchTo(s.organizationId)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
            >
              <span className="flex-1 truncate">
                {s.name}
                {s.organizationId === rootOrganizationId && <span className="ml-1 text-[10px] text-ink-tertiary">· billing</span>}
              </span>
              {s.organizationId === currentOrganizationId && <Check className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />}
            </button>
          ))}

          <div className="my-1 border-t border-hairline" />

          {adding ? (
            <div className="flex flex-col gap-1.5 p-1.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addStudio();
                  if (e.key === "Escape") setAdding(false);
                }}
                placeholder="New studio name"
                aria-label="New studio name"
                className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-primary"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy || name.trim().length < 2}
                  onClick={() => void addStudio()}
                  className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create & switch"}
                </button>
                <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2 py-1.5 text-xs text-ink-subtle hover:bg-surface-2">
                  Cancel
                </button>
              </div>
            </div>
          ) : atLimit ? (
            <p className="px-2 py-1.5 text-[11px] leading-relaxed text-ink-tertiary">
              {maxLinkedStudios} studio{maxLinkedStudios === 1 ? "" : "s"} on this plan — upgrade in Settings → Plan for
              {maxLinkedStudios === 3 ? " unlimited studios." : " more."}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add another studio
            </button>
          )}

          {linkable.length > 0 && !atLimit && (
            <>
              <div className="my-1 border-t border-hairline" />
              <p className="px-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">Link a studio you own</p>
              {linkable.slice(0, 4).map((s) => (
                <button
                  key={s.organizationId}
                  type="button"
                  disabled={busy}
                  onClick={() => void linkStudio(s.organizationId)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                >
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-[10px] text-primary">link</span>
                </button>
              ))}
            </>
          )}

          {error && <p className="px-2 pb-1 pt-1 text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
