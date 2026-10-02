"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Heart, Send } from "lucide-react";

import { AppCanvas, Laptop, Scaled, useLoop } from "./device";

/**
 * Scripted "screen recordings" of the real Snap surfaces. Each scene is a
 * pure function of a loop step, authored at 960x600 and scaled by <Scaled>.
 * They replay while on screen and sleep when they are not.
 */

export type SceneId = "pipeline" | "calendar" | "contract" | "gallery" | "payments";

export const SCENE_STEPS: Record<SceneId, number> = {
  pipeline: 7,
  calendar: 6,
  contract: 7,
  gallery: 7,
  payments: 6,
};

const ph = (n: string) => `/imgs/landing/t/${n}`;
const EASE = [0.16, 1, 0.3, 1] as const;

const pill = "rounded-full px-2 py-0.5 text-[10px] font-medium";

/* ───────────────────────── Pipeline ───────────────────────── */

const COLUMNS = ["Booked", "Snapping", "Evaluation", "Complete", "Closed"];
const STATIC_CARDS: { col: number; row: number; name: string; kind: string; amt: string }[] = [
  { col: 0, row: 0, name: "Ava Chen", kind: "Maternity", amt: "$450" },
  { col: 1, row: 0, name: "Brooks Family", kind: "Mini session", amt: "$220" },
  { col: 2, row: 0, name: "Ortiz & Lee", kind: "Engagement", amt: "$680" },
  { col: 3, row: 0, name: "Hana M.", kind: "Newborn", amt: "$540" },
  { col: 3, row: 1, name: "Kline Co.", kind: "Headshots", amt: "$900" },
  { col: 4, row: 0, name: "Dev & Priya", kind: "Wedding", amt: "$3,200" },
];

const COL_W = 137.6;
const COL_GAP = 12;

function PipelineScene({ step }: { step: number }) {
  const col = [0, 0, 1, 2, 3, 4, 4][step] ?? 0;
  return (
    <AppCanvas
      active="Pipeline"
      title="Pipeline"
      right={<span className={`${pill} bg-primary text-white`}>+ New lead</span>}
    >
      <div className="relative h-full px-6 pt-5">
        <div className="grid grid-cols-5 gap-3">
          {COLUMNS.map((c, i) => (
            <div key={c} className="min-h-[400px] rounded-lg bg-surface-1 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-medium text-ink-subtle">
                {c}
                <span className="text-ink-tertiary">
                  {STATIC_CARDS.filter((s) => s.col === i).length + (col === i ? 1 : 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
        {STATIC_CARDS.map((s) => (
          <div
            key={s.name}
            className="absolute w-[121px] rounded-md border border-hairline bg-background p-2 shadow-sm"
            style={{ left: 24 + 8 + s.col * (COL_W + COL_GAP), top: 20 + 38 + s.row * 82 + (s.col === col ? 82 : 0) }}
          >
            <div className="text-[11.5px] font-semibold">{s.name}</div>
            <div className="text-[10px] text-ink-subtle">{s.kind}</div>
            <div className="mt-1.5 text-[10px] font-medium text-ink-muted">{s.amt}</div>
          </div>
        ))}
        <motion.div
          animate={{ left: 24 + 8 + col * (COL_W + COL_GAP) }}
          transition={{ duration: 0.8, ease: EASE }}
          className="absolute z-10 w-[121px] rounded-md border border-primary/50 bg-background p-2 shadow-[0_10px_28px_-8px_rgb(94,106,210,0.5)]"
          style={{ top: 20 + 38 }}
        >
          <div className="flex items-center gap-1 text-[11.5px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Maya &amp; Jon
          </div>
          <div className="text-[10px] text-ink-subtle">Wedding · Jun 14</div>
          <div className="mt-1.5 text-[10px] font-medium text-ink-muted">$2,800</div>
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-hairline bg-background px-3.5 py-1.5 text-[11.5px] text-ink-muted shadow-md"
          >
            {
              [
                "New inquiry from your booking page",
                "Deposit paid - moved to Booked",
                "Shoot day - Snapping",
                "Gallery culled - Evaluation",
                "Delivered - Complete",
                "Final invoice paid - Closed",
                "Maya & Jon: 5 stars, referral sent",
              ][step]
            }
          </motion.div>
        </AnimatePresence>
      </div>
    </AppCanvas>
  );
}

/* ───────────────────────── Calendar ───────────────────────── */

const SHOOTS: Record<number, "booked" | "tentative"> = { 4: "booked", 9: "booked", 12: "tentative", 23: "booked", 27: "booked" };

function CalendarScene({ step }: { step: number }) {
  const cells = Array.from({ length: 35 }, (_, i) => i - 3); // month starts Thursday
  return (
    <AppCanvas active="Calendar" title="June 2027" right={<span className="text-[11px] text-ink-subtle">Month · Week</span>}>
      <div className="relative h-full px-6 pt-4">
        <div className="mb-1 grid grid-cols-7 text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 pb-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-hairline">
          {cells.map((d, i) => {
            const valid = d >= 1 && d <= 30;
            const s = SHOOTS[d];
            return (
              <div key={i} className="h-[88px] border-b border-r border-hairline bg-background p-1.5 [&:nth-child(7n)]:border-r-0">
                {valid && <div className="text-[10.5px] text-ink-subtle">{d}</div>}
                {valid && s === "booked" && (
                  <div className="mt-1 truncate rounded bg-[#1e8e3e]/15 px-1.5 py-1 text-[10px] font-medium text-[#1e8e3e]">Shoot day</div>
                )}
                {valid && s === "tentative" && (
                  <div className="mt-1 truncate rounded border border-dashed border-ink-tertiary px-1.5 py-1 text-[10px] text-ink-subtle">Tentative</div>
                )}
                {valid && d === 18 && (
                  <motion.div
                    initial={false}
                    animate={step >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.7, y: -16 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="mt-1 truncate rounded bg-primary px-1.5 py-1 text-[10px] font-medium text-white"
                  >
                    Maya &amp; Jon
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
        <motion.div
          initial={false}
          animate={step >= 2 && step <= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="absolute right-8 top-6 w-[240px] rounded-xl border border-hairline bg-background p-3.5 shadow-xl"
        >
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#1e8e3e] text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            Booking confirmed
          </div>
          <div className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
            Maya &amp; Jon · Wedding · Jun 18, 3:00 PM
            <br />
            $800 deposit paid to your Stripe
            <br />
            Contract + questionnaire sent
          </div>
        </motion.div>
      </div>
    </AppCanvas>
  );
}

/* ───────────────────────── Contract ───────────────────────── */

function ContractScene({ step }: { step: number }) {
  const status = ["Draft", "Sent", "Viewed", "Viewed", "Signed", "Countersigned", "Countersigned"][step] ?? "Draft";
  const signed = step >= 4;
  return (
    <AppCanvas active="Contracts" title="Wedding Agreement" right={<span className={`${pill} ${signed ? "bg-[#1e8e3e]/15 text-[#1e8e3e]" : "bg-surface-3 text-ink-subtle"}`}>{status}</span>}>
      <div className="flex h-full gap-6 px-8 pt-5">
        <div className="relative h-[470px] w-[480px] shrink-0 rounded-md border border-hairline bg-white p-7 text-[#0f1011] shadow-md">
          <div className="text-[15px] font-semibold">Photography Services Agreement</div>
          <div className="mt-1 text-[10px] text-[#62666d]">Willow &amp; Pine Photo · Maya &amp; Jon · Jun 18</div>
          <div className="mt-5 space-y-2">
            {[96, 100, 88, 100, 72, 0, 100, 94, 60].map((w, i) =>
              w === 0 ? <div key={i} className="h-3" /> : <div key={i} className="h-[7px] rounded-full bg-[#e3e5e8]" style={{ width: `${w}%` }} />,
            )}
          </div>
          <div className="absolute bottom-7 left-7 right-7 flex items-end justify-between gap-6">
            {["Client", "Photographer"].map((who, i) => (
              <div key={who} className="flex-1">
                <div className="relative h-14 border-b border-[#b9bdc4]">
                  {(i === 0 ? step >= 3 : step >= 5) && (
                    <svg viewBox="0 0 160 50" className="absolute bottom-1 left-2 h-12 w-36 text-[#4c56b4]">
                      <motion.path
                        key={`${who}-${step >= (i === 0 ? 3 : 5)}`}
                        d="M4 36 C 14 6, 24 6, 22 30 S 34 40, 44 18 S 58 8, 60 28 C 66 44, 80 8, 92 22 S 112 40, 120 20 L 150 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.9, ease: "easeInOut" }}
                      />
                    </svg>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-[#62666d]">{who}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-2.5 pt-2">
          {[
            ["Sent to client", 1],
            ["Viewed by Maya", 2],
            ["Signed by Maya", 4],
            ["Countersigned", 5],
          ].map(([label, at]) => {
            const done = step >= (at as number);
            return (
              <motion.div
                key={label as string}
                animate={{ opacity: done ? 1 : 0.4 }}
                className="flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-1 px-3 py-2.5 text-[12px]"
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full ${done ? "bg-[#1e8e3e] text-white" : "bg-surface-3 text-ink-tertiary"}`}>
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {label}
              </motion.div>
            );
          })}
          <div className="rounded-lg border border-dashed border-hairline-strong p-3 text-[11px] leading-relaxed text-ink-subtle">
            Signed PDF is stored on the project automatically. No printing, no chasing.
          </div>
        </div>
      </div>
    </AppCanvas>
  );
}

/* ───────────────────────── Gallery ───────────────────────── */

const GALLERY = ["wedding-couple.jpg", "wedding-veil.jpg", "wedding-bouquet.jpg", "wedding-rings.jpg", "wedding-sparkler.jpg", "wedding-dance.jpg"];
const HEARTED_AT: Record<number, number> = { 0: 2, 2: 3, 4: 4, 5: 5 };

function GalleryScene({ step }: { step: number }) {
  const favs = Object.values(HEARTED_AT).filter((s) => step >= s).length;
  return (
    <AppCanvas active="Galleries" title="Maya & Jon - Wedding" right={<span className={`${pill} bg-primary text-white`}>Share gallery</span>}>
      <div className="flex h-full gap-5 px-6 pt-4">
        <div className="grid flex-1 grid-cols-3 gap-2.5 self-start">
          {GALLERY.map((g, i) => (
            <div key={g} className="relative h-[238px] overflow-hidden rounded-md bg-surface-2">
              <img src={ph(g)} alt="" loading="eager" draggable={false} className="h-full w-full object-cover" />
              {HEARTED_AT[i] !== undefined && (
                <motion.span
                  initial={false}
                  animate={step >= HEARTED_AT[i] ? { scale: [0.3, 1.25, 1], opacity: 1 } : { scale: 0.3, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow"
                >
                  <Heart className="h-3 w-3 fill-[#e5484d] text-[#e5484d]" />
                </motion.span>
              )}
            </div>
          ))}
        </div>
        <div className="w-[188px] shrink-0 space-y-2.5">
          <div className="rounded-lg border border-hairline bg-surface-1 p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Client favorites</div>
            <div className="mt-1 text-[26px] font-semibold leading-none tracking-tight">{favs}</div>
          </div>
          <div className="rounded-lg border border-hairline bg-surface-1 p-3 text-[11px] text-ink-subtle">
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Access</div>
            Email code · expires in 30 days · downloads on
          </div>
          <motion.div
            animate={step >= 5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 rounded-lg bg-[#1e8e3e]/12 p-3 text-[11.5px] font-medium text-[#1e8e3e]"
          >
            <Send className="h-3.5 w-3.5" /> Delivered to Maya &amp; Jon
          </motion.div>
        </div>
      </div>
    </AppCanvas>
  );
}

/* ───────────────────────── Payments ───────────────────────── */

function PaymentsScene({ step }: { step: number }) {
  const paid = step >= 2;
  const payout = step >= 4 ? 2800 : step >= 3 ? 800 : 0;
  return (
    <AppCanvas active="Payments" title="Invoice #1042" right={<span className={`${pill} ${paid ? "bg-[#1e8e3e]/15 text-[#1e8e3e]" : "bg-[#d97706]/15 text-[#b45309]"}`}>{paid ? "Paid" : "Awaiting payment"}</span>}>
      <div className="flex h-full gap-6 px-8 pt-5">
        <div className="relative h-[430px] w-[440px] rounded-md border border-hairline bg-white p-6 text-[#0f1011] shadow-md">
          <div className="flex justify-between">
            <div className="text-[14px] font-semibold">Willow &amp; Pine Photo</div>
            <div className="text-right text-[10px] text-[#62666d]">
              Invoice #1042
              <br />
              Due Jun 1
            </div>
          </div>
          <div className="mt-6 space-y-2.5 text-[12px]">
            {[
              ["Wedding coverage - 8 hours", "$2,400"],
              ["Second shooter", "$400"],
              ["Deposit received", "-$800"],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between border-b border-[#e3e5e8] pb-2">
                <span>{a}</span>
                <span className="tabular-nums">{b}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1 text-[14px] font-semibold">
              <span>Balance due</span>
              <span className="tabular-nums">$2,000</span>
            </div>
          </div>
          <motion.div
            initial={false}
            animate={paid ? { opacity: 1, scale: 1, rotate: -9 } : { opacity: 0, scale: 1.8, rotate: -9 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute bottom-8 right-8 rounded-md border-[3px] border-[#1e8e3e] px-4 py-1 text-[22px] font-bold tracking-widest text-[#1e8e3e]"
          >
            PAID
          </motion.div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="rounded-xl border border-hairline bg-surface-1 p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Paid out to your Stripe</div>
            <div className="mt-1 text-[34px] font-semibold tabular-nums leading-none tracking-tight">${payout.toLocaleString()}</div>
            <div className="mt-2 text-[11px] text-ink-subtle">Snap commission: <span className="font-semibold text-[#1e8e3e]">$0.00</span></div>
          </div>
          <div className="rounded-lg border border-hairline bg-background p-3 text-[11.5px] text-ink-subtle">
            Reminder emails send themselves 7 days, 3 days and the day before it is due.
          </div>
        </div>
      </div>
    </AppCanvas>
  );
}

/* ───────────────────────── Public wrapper ───────────────────────── */

const SCENES: Record<SceneId, (p: { step: number }) => React.ReactElement> = {
  pipeline: PipelineScene,
  calendar: CalendarScene,
  contract: ContractScene,
  gallery: GalleryScene,
  payments: PaymentsScene,
};

/** A laptop playing one scene on a loop. */
export function LaptopReplay({ scene, ms = 1500, className = "" }: { scene: SceneId; ms?: number; className?: string }) {
  const { ref, step } = useLoop(SCENE_STEPS[scene], ms);
  const Scene = SCENES[scene];
  return (
    <div ref={ref} className={className}>
      <Laptop>
        <Scaled w={960} h={600}>
          <Scene step={step} />
        </Scaled>
      </Laptop>
    </div>
  );
}
