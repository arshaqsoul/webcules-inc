"use client";

/* Setup Guide surfaces (WEB-270) — the same checklist rendered two ways:
 * a compact sidebar progress card (variant "card") and the first-login panel
 * (variant "panel"). All state arrives server-derived; the only mutations
 * are dismiss / reopen / the demo-gallery action (POST then refresh so the
 * ticks re-derive from server truth). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ListChecks } from "lucide-react";

export type SetupStepView = {
  id: string;
  title: string;
  why: string;
  href: string | null;
  done: boolean;
};

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-10 w-10 items-center justify-center" role="img" aria-label={`${done} of ${total} setup steps done`}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" className="stroke-surface-2" />
        <circle
          cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
          className="stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold text-ink">{done}/{total}</span>
    </span>
  );
}

function StepRow({ step, onDemo, demoBusy }: { step: SetupStepView; onDemo: () => void; demoBusy: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          step.done ? "border-primary bg-primary text-white" : "border-hairline bg-surface-2"
        }`}
      >
        {step.done && <Check className="h-2.5 w-2.5" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-medium leading-tight ${step.done ? "text-ink-tertiary line-through" : "text-ink"}`}>
          {step.title}
        </p>
        {!step.done && <p className="mt-0.5 text-xs leading-snug text-ink-tertiary">{step.why}</p>}
      </div>
      {!step.done &&
        (step.href ? (
          <a
            href={step.href}
            className="mt-0.5 shrink-0 rounded-md border border-hairline bg-background px-2 py-0.5 text-[11px] font-medium text-ink-subtle hover:border-primary hover:text-primary"
          >
            Go
          </a>
        ) : (
          <button
            type="button"
            onClick={onDemo}
            disabled={demoBusy}
            className="mt-0.5 shrink-0 rounded-md border border-hairline bg-background px-2 py-0.5 text-[11px] font-medium text-ink-subtle hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {demoBusy ? "Sending…" : "Send demo"}
          </button>
        ))}
    </li>
  );
}

export function SetupGuideCard({
  steps,
  done,
  total,
  variant,
}: {
  steps: SetupStepView[];
  done: number;
  total: number;
  variant: "card" | "panel";
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(variant === "panel");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const next = steps.filter((s) => !s.done);
  const shown = expanded ? steps : next.slice(0, 3);

  async function act(action: "dismiss" | "reopen" | "demo-gallery") {
    if (action === "demo-gallery") setDemoBusy(true);
    else setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/studio/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { galleryUrl?: string; error?: string };
      if (res.ok && action === "demo-gallery" && body.galleryUrl) {
        setMsg("Demo sent — check your email, or open it now.");
        window.open(body.galleryUrl, "_blank", "noopener");
      } else if (!res.ok) {
        setMsg(body.error === "no_owner" ? "Couldn't find the studio owner's email." : "That didn't work — try again.");
      }
    } catch {
      setMsg("Network error — try again.");
    }
    setBusy(false);
    setDemoBusy(false);
    if (action !== "demo-gallery") router.refresh();
  }

  if (variant === "panel") {
    return (
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <ProgressRing done={done} total={total} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink">Let&apos;s get your studio ready</h2>
            <p className="mt-0.5 text-xs text-ink-subtle">About 20 minutes, once. Skip anything — everything works unlocked.</p>
          </div>
          <button
            type="button"
            onClick={() => void act("dismiss")}
            disabled={busy}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-ink-tertiary hover:text-ink disabled:opacity-60"
          >
            Skip — I&apos;ll set things up as I go
          </button>
        </div>
        <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} onDemo={() => void act("demo-gallery")} demoBusy={demoBusy} />
          ))}
        </ol>
        {msg && <p className="mt-3 text-xs text-primary">{msg}</p>}
      </section>
    );
  }

  return (
    <div className="mx-2 my-3 rounded-lg border border-hairline bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <ProgressRing done={done} total={total} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden /> Studio setup
          </p>
          <p className="text-[11px] text-ink-tertiary">
            {done === total ? "All set — you're live." : `${next.length} to go`}
          </p>
        </div>
      </div>
      <ol className="mt-2.5 flex flex-col gap-2">
        {shown.map((s) => (
          <StepRow key={s.id} step={s} onDemo={() => void act("demo-gallery")} demoBusy={demoBusy} />
        ))}
      </ol>
      <div className="mt-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show all ${total}`}
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void act("dismiss")}
          disabled={busy}
          className="text-[11px] text-ink-tertiary hover:text-ink disabled:opacity-60"
        >
          Hide this
        </button>
      </div>
      {msg && <p className="mt-2 text-[11px] text-primary">{msg}</p>}
    </div>
  );
}
