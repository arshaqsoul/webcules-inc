"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Heart, Lock, Send } from "lucide-react";

import { AppCanvas, Laptop, Scaled, useLoop } from "./device";

/**
 * Scripted "screen recordings" of the real Snap surfaces. Each scene is a
 * pure function of a loop step, authored at 960x600 and scaled by <Scaled>.
 * They replay while on screen and sleep when they are not.
 */

export type SceneId = "pipeline" | "calendar" | "contract" | "gallery" | "payments" | "cull" | "templates" | "secure";

export const SCENE_STEPS: Record<SceneId, number> = {
  pipeline: 7,
  calendar: 6,
  contract: 7,
  gallery: 7,
  payments: 6,
  cull: 8,
  templates: 8,
  secure: 8,
};

/** Loop tick per scene (ms) - tuned so every scene plays through in ~8s. */
export const SCENE_MS: Record<SceneId, number> = {
  pipeline: 1150,
  calendar: 1500,
  contract: 1400,
  gallery: 1400,
  payments: 1500,
  cull: 1000,
  templates: 1000,
  secure: 1000,
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

/* ───────────────────────── Cull (triage mode) ───────────────────────── */

const CULL_SHOTS = ["wedding-bouquet.jpg", "wedding-dance.jpg", "wedding-couple.jpg", "wedding-sparkler.jpg", "wedding-veil.jpg", "wedding-field.jpg", "wedding-rings.jpg", "wedding-table.jpg"];
/** 1 = keep (swipe right), -1 = pass (swipe left). */
const CULL_DIR = [1, 1, -1, 1, -1, 1, 1, -1];

const CULL_EXIT = {
  exit: (d: number) => ({ x: d * 520, rotate: d * 16, opacity: 0, transition: { duration: 0.4, ease: "easeIn" as const } }),
};

function CullScene({ step }: { step: number }) {
  const decided = CULL_DIR.slice(0, step);
  const kept = 87 + decided.filter((d) => d === 1).length;
  const passed = 19 + decided.filter((d) => d === -1).length;
  const dir = CULL_DIR[step] ?? 1;
  return (
    <AppCanvas
      active="Galleries"
      title="Triage - Maya & Jon"
      right={<span className="text-[11px] text-ink-subtle">212 frames · ← pass · → keep · 1-5 rate</span>}
    >
      <div className="flex h-full items-center gap-8 px-8">
        <div className="relative flex h-[470px] flex-1 items-center justify-center">
          <AnimatePresence custom={CULL_DIR[(step + CULL_DIR.length - 1) % CULL_DIR.length]} mode="popLayout">
            <motion.div
              key={step}
              custom={dir}
              initial={{ scale: 0.92, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0, x: 0, rotate: 0 }}
              variants={CULL_EXIT}
              exit="exit"
              transition={{ duration: 0.4, ease: EASE }}
              className="relative h-[430px] w-[330px] overflow-hidden rounded-xl border border-hairline bg-white p-2 shadow-[0_24px_50px_-18px_rgb(0,0,0,0.35)]"
            >
              <img src={ph(CULL_SHOTS[step % CULL_SHOTS.length]!)} alt="" draggable={false} loading="eager" className="h-[380px] w-full rounded-md object-cover" />
              <div className="mt-2 flex justify-between px-1 font-mono text-[10px] text-ink-tertiary">
                <span>BR-0{142 + step}</span>
                <span>{"★".repeat(dir === 1 ? 4 : 2)}</span>
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 1.6, rotate: dir * -12 }}
                animate={{ opacity: 1, scale: 1, rotate: dir * -12 }}
                transition={{ delay: 0.3, duration: 0.2 }}
                className={`absolute top-6 rounded-md border-[3px] px-3 py-1 text-[20px] font-bold tracking-widest ${
                  dir === 1 ? "left-5 border-[#1e8e3e] text-[#1e8e3e]" : "right-5 border-[#cc3d3d] text-[#cc3d3d]"
                }`}
              >
                {dir === 1 ? "KEEP" : "PASS"}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="w-[190px] shrink-0 space-y-3">
          <div className="rounded-lg border border-hairline bg-surface-1 p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Kept</div>
            <div className="mt-1 text-[30px] font-semibold tabular-nums leading-none text-[#1e8e3e]">{kept}</div>
          </div>
          <div className="rounded-lg border border-hairline bg-surface-1 p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Passed</div>
            <div className="mt-1 text-[30px] font-semibold tabular-nums leading-none text-[#cc3d3d]">{passed}</div>
          </div>
          <div className="rounded-lg border border-hairline bg-surface-1 p-3 text-[11px] text-ink-subtle">
            <div className="mb-1.5 flex justify-between"><span>Remaining</span><span className="tabular-nums">{212 - 106 - step}</span></div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-3">
              <motion.div animate={{ width: `${((106 + step) / 212) * 100}%` }} className="h-full rounded-full bg-primary" />
            </div>
          </div>
          <div className="rounded-lg bg-primary/10 p-3 text-[11.5px] font-medium text-primary">Thousands of frames in minutes</div>
        </div>
      </div>
    </AppCanvas>
  );
}

/* ───────────────────────── Templates ───────────────────────── */

const TEMPLATES = [
  { name: "Classic Wedding", bg: "#ffffff", fg: "#0f1011", layout: "hero", img: "wedding-couple.jpg", font: "serif" },
  { name: "Dark Cinematic", bg: "#0b0b0d", fg: "#f4f4f5", layout: "cinema", img: "wedding-sparkler.jpg", font: "serif" },
  { name: "Editorial", bg: "#f5efe6", fg: "#2a2118", layout: "split", img: "wedding-bouquet.jpg", font: "serif" },
  { name: "Minimal Mono", bg: "#ffffff", fg: "#0f1011", layout: "grid", img: "wedding-rings.jpg", font: "mono" },
] as const;
const GRID_IMGS = ["wedding-veil.jpg", "wedding-dance.jpg", "wedding-table.jpg", "wedding-field.jpg", "wedding-bouquet.jpg", "wedding-couple.jpg"];

function TemplatePreview({ t }: { t: (typeof TEMPLATES)[number] }) {
  const titleStyle = { color: t.fg, fontFamily: t.font === "mono" ? "ui-monospace, Menlo, monospace" : '"Instrument Serif", Georgia, serif' };
  const grid = (
    <div className="grid grid-cols-3 gap-1.5 p-3">
      {GRID_IMGS.map((g, i) => (
        <img key={g} src={ph(g)} alt="" draggable={false} loading="eager" className={`w-full rounded-sm object-cover ${t.layout === "grid" ? "h-[118px]" : i % 2 ? "h-[70px]" : "h-[90px]"}`} />
      ))}
    </div>
  );
  return (
    <div className="h-full w-full overflow-hidden" style={{ background: t.bg }}>
      {t.layout === "hero" && (
        <>
          <div className="relative h-[190px]">
            <img src={ph(t.img)} alt="" draggable={false} loading="eager" className="h-full w-full object-cover" />
            <div className="absolute inset-0 grid place-items-center bg-black/25 text-center text-white">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] opacity-80">Willow &amp; Pine Photo</div>
                <div className="text-[34px] leading-none" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>Maya &amp; Jon</div>
              </div>
            </div>
          </div>
          {grid}
        </>
      )}
      {t.layout === "cinema" && (
        <>
          <div className="relative h-[210px]">
            <img src={ph(t.img)} alt="" draggable={false} loading="eager" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute bottom-3 left-4" style={titleStyle}>
              <div className="text-[9px] uppercase tracking-[0.3em] opacity-70">June 18 · Wedding</div>
              <div className="text-[38px] leading-none">Maya &amp; Jon</div>
            </div>
          </div>
          {grid}
        </>
      )}
      {t.layout === "split" && (
        <>
          <div className="flex h-[200px]">
            <img src={ph(t.img)} alt="" draggable={false} loading="eager" className="h-full w-1/2 object-cover" />
            <div className="flex w-1/2 flex-col justify-center px-5" style={titleStyle}>
              <div className="text-[9px] uppercase tracking-[0.25em] opacity-60">The Wedding of</div>
              <div className="mt-1 text-[34px] leading-[1]">Maya<br />&amp; Jon</div>
            </div>
          </div>
          {grid}
        </>
      )}
      {t.layout === "grid" && (
        <>
          <div className="px-4 pb-1 pt-4" style={titleStyle}>
            <div className="text-[13px] font-medium tracking-tight">maya-jon / wedding</div>
            <div className="text-[10px] opacity-60">212 photos</div>
          </div>
          {grid}
        </>
      )}
    </div>
  );
}

function TemplatesScene({ step }: { step: number }) {
  const idx = Math.floor(step / 2) % TEMPLATES.length;
  const t = TEMPLATES[idx]!;
  const applied = step % 2 === 1;
  return (
    <AppCanvas active="Galleries" title="Template Studio" right={<span className={`${pill} bg-primary text-white`}>Publish</span>}>
      <div className="flex h-full gap-5 px-6 pt-4">
        <div className="w-[170px] shrink-0 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">10 designer templates</div>
          {TEMPLATES.map((x, i) => (
            <motion.div
              key={x.name}
              animate={{ borderColor: i === idx ? "rgb(94,106,210)" : "rgb(227,229,232)", scale: i === idx ? 1.02 : 1 }}
              className="flex items-center gap-2.5 rounded-lg border bg-background p-2"
            >
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10" style={{ background: x.bg }}>
                <img src={ph(x.img)} alt="" loading="eager" draggable={false} className="h-1/2 w-full object-cover" />
              </span>
              <span className="text-[11.5px] font-medium leading-tight">{x.name}</span>
            </motion.div>
          ))}
          <motion.div
            animate={applied ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            className="flex items-center justify-between rounded-lg bg-[#1e8e3e]/12 px-2.5 py-2 text-[11px] font-medium text-[#1e8e3e]"
          >
            <span className="flex items-center gap-1.5"><Check className="h-3 w-3" strokeWidth={3} /> Applied</span>
            <span className="underline">Undo</span>
          </motion.div>
        </div>
        <div className="relative h-[480px] flex-1 overflow-hidden rounded-xl border border-hairline shadow-lg">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={t.name}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <TemplatePreview t={t} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </AppCanvas>
  );
}

/* ───────────────────────── Secure link ───────────────────────── */

function SecureScene({ step }: { step: number }) {
  const revoked = step >= 7;
  const code = "482913".slice(0, Math.max(0, Math.min(6, step - 1)));
  const unlocked = step >= 5 && !revoked;
  return (
    <AppCanvas active="Galleries" title="Share gallery" right={<span className={`${pill} ${revoked ? "bg-[#cc3d3d]/12 text-[#cc3d3d]" : "bg-[#1e8e3e]/15 text-[#1e8e3e]"}`}>{revoked ? "Revoked" : "Private"}</span>}>
      <div className="flex h-full gap-5 px-6 pt-5">
        <div className="w-[290px] shrink-0 space-y-3">
          <div className="rounded-lg border border-hairline bg-surface-1 p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Client link</div>
            <div className="mt-1.5 truncate rounded-md border border-hairline bg-background px-2.5 py-2 font-mono text-[11px] text-ink-muted">photos.willowpine.com/g/maya-jon</div>
          </div>
          {[
            ["Email code required", true],
            ["Expires in 30 days", true],
            ["Download PIN", true],
          ].map(([label]) => (
            <div key={label as string} className="flex items-center justify-between rounded-lg border border-hairline bg-background px-3 py-2.5 text-[12px]">
              {label}
              <span className="relative h-4 w-7 rounded-full bg-primary">
                <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-white" />
              </span>
            </div>
          ))}
          <motion.div
            animate={{ scale: step === 6 ? 1.04 : 1 }}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-medium ${
              step >= 6 ? "border-[#cc3d3d] bg-[#cc3d3d] text-white" : "border-hairline bg-background text-ink-muted"
            }`}
          >
            <Lock className="h-3.5 w-3.5" /> Revoke this link
          </motion.div>
          <div className="rounded-lg border border-dashed border-hairline-strong p-3 text-[11px] leading-relaxed text-ink-subtle">
            Leak-proof by default. One click and the link is dead everywhere.
          </div>
        </div>
        <div className="relative flex-1 overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-lg">
          <div className="flex h-8 items-center gap-1.5 border-b border-hairline bg-background px-3">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" /><span className="h-2 w-2 rounded-full bg-[#febc2e]" /><span className="h-2 w-2 rounded-full bg-[#28c840]" />
            <span className="ml-3 flex-1 truncate rounded bg-surface-2 px-2 py-0.5 text-center font-mono text-[9.5px] text-ink-subtle">photos.willowpine.com/g/maya-jon</span>
          </div>
          <div className="relative h-[440px]">
            <AnimatePresence mode="wait">
              {step < 5 && (
                <motion.div key="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center">
                  <div className="w-[270px] rounded-xl border border-hairline bg-background p-5 text-center shadow-md">
                    <Lock className="mx-auto h-5 w-5 text-primary" />
                    <div className="mt-2 text-[14px] font-semibold">Maya &amp; Jon</div>
                    <div className="mt-1 text-[11px] text-ink-subtle">Enter the code we emailed you</div>
                    <div className="mt-4 flex justify-center gap-1.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} className={`grid h-9 w-8 place-items-center rounded-md border text-[15px] font-semibold ${i < code.length ? "border-primary" : "border-hairline"}`}>{code[i] ?? ""}</span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
              {unlocked && (
                <motion.div key="open" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid grid-cols-3 gap-1.5 p-3">
                  {GRID_IMGS.map((g) => (
                    <img key={g} src={ph(g)} alt="" draggable={false} loading="eager" className="h-[200px] w-full rounded-md object-cover" />
                  ))}
                </motion.div>
              )}
              {revoked && (
                <motion.div key="dead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#cc3d3d]/12 text-[#cc3d3d]"><Lock className="h-4 w-4" /></div>
                    <div className="mt-2 text-[14px] font-semibold">This link is no longer available</div>
                    <div className="mt-1 text-[11px] text-ink-subtle">Ask Willow &amp; Pine for a new link.</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
  cull: CullScene,
  templates: TemplatesScene,
  secure: SecureScene,
};

/** A laptop playing one scene on a loop. */
export function LaptopReplay({ scene, ms, className = "" }: { scene: SceneId; ms?: number; className?: string }) {
  const { ref, step } = useLoop(SCENE_STEPS[scene], ms ?? SCENE_MS[scene]);
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
