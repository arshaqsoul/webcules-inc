"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ClipboardList,
  Columns3,
  Globe,
  HardDrive,
  Images,
  LockKeyhole,
  Mail,
  Palette,
  PenLine,
} from "lucide-react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";

import { FadeUp } from "./text-reveal";

/**
 * Ten tiles, ten honest demos. Every animation mirrors a real Snap surface
 * (pipeline kanban, triage cull, OTP vault, booking, white-label, emails,
 * domains, forms, contracts, RAW vault) — no decorative motion.
 */
export function BentoFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <FadeUp className="mx-auto mb-12 max-w-3xl text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">The platform</p>
        <h2 className="snap-display mt-3 text-4xl leading-[1.05] text-ink sm:text-6xl">
          The platform under <em className="italic">every frame.</em>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-ink-subtle sm:text-base">
          One login, one bill: booking, pipeline, vault-grade galleries, contracts,
          emails, and payouts to your own Stripe. Ten things you stop duct-taping:
        </p>
      </FadeUp>

      <div className="grid auto-rows-[minmax(200px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-6">
        <BentoTile
          className="md:col-span-4"
          icon={<Columns3 className="h-4 w-4" />}
          title="A pipeline that mirrors your shoot"
          desc="Booked → Snapping → Evaluation → Complete → Closed. The first kanban built for photography — drag a card, that's the whole system."
        >
          <PipelineDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2 md:row-span-2"
          icon={<Images className="h-4 w-4" />}
          title="Cull at speed"
          desc="Triage mode: swipe right to keep, left to reject. Thousands of frames in minutes — ratings, flags and folders stay in sync."
        >
          <CullDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<LockKeyhole className="h-4 w-4" />}
          title="Galleries built like vaults"
          desc="Email-code access, expiring links, one-click revocation. Leak-proof by default."
        >
          <VaultDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<CalendarDays className="h-4 w-4" />}
          title="Booking on your own site"
          desc="Embeddable calendar with session types, deposits and questions — in your brand, on your domain."
        >
          <BookingDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<Palette className="h-4 w-4" />}
          title="White-label everything"
          desc="Your logo, your colors, your domain — on galleries, emails and invoices. Clients never see our name."
        >
          <BrandDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<Mail className="h-4 w-4" />}
          title="Emails that feel like you"
          desc="Templates with merge fields — gallery links, reminders, payment receipts — signed with your studio's voice."
        >
          <EmailDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<Globe className="h-4 w-4" />}
          title="Custom domains"
          desc="gallery.yourstudio.com, with SSL handled. Your brand in the address bar, not ours."
        >
          <DomainDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<ClipboardList className="h-4 w-4" />}
          title="Forms & questionnaires"
          desc="Shot lists, timelines, must-have lists — clients fill them, answers land on the project."
        >
          <FormsDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<PenLine className="h-4 w-4" />}
          title="Contracts & e-sign"
          desc="Send, sign, countersign — stored with the project. No more PDF ping-pong."
        >
          <ContractDemo />
        </BentoTile>

        <BentoTile
          className="md:col-span-2"
          icon={<HardDrive className="h-4 w-4" />}
          title="RAW Vault"
          desc="RAWs stay hot for 6 months, extend with one click — never silently deleted."
        >
          <RawDemo />
        </BentoTile>
      </div>
    </section>
  );
}

function BentoTile({
  icon,
  title,
  desc,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`group flex flex-col rounded-2xl border border-hairline bg-surface-1 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-lavender/40 hover:shadow-[0_16px_40px_rgb(15,16,17,0.07)] ${className ?? ""}`}
    >
      <div className="mb-2 flex items-center gap-2.5 text-primary">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10">{icon}</span>
        <h3 className="text-[15px] font-semibold tracking-[-0.2px] text-ink">{title}</h3>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-subtle">{desc}</p>
      <div className="mt-4 flex-1 overflow-hidden rounded-xl border border-hairline bg-background">{children}</div>
    </div>
  );
}

/* ---------------------------------- demos --------------------------------- */

const STOPS = ["Booked", "Snapping", "Evaluation", "Complete", "Closed"];

function PipelineDemo() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-4">
      <div className="relative h-11">
        <motion.div
          animate={{ left: ["1%", "25.5%", "50%", "74.5%", "99%"] }}
          transition={{ duration: 9, times: [0, 0.25, 0.5, 0.75, 1], repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 flex h-11 w-[24%] items-center gap-2 rounded-lg border border-lavender/30 bg-primary/10 px-2.5 shadow-[0_6px_18px_rgb(94,106,210,0.18)]"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary text-[9px] font-bold text-white">A</span>
          <span className="truncate text-[11px] font-medium text-ink">Maya + Jordan</span>
        </motion.div>
      </div>
      <div className="flex items-center justify-between">
        {STOPS.map((stop, i) => (
          <div key={stop} className="flex flex-1 flex-col items-center gap-1.5">
            <motion.span
              animate={{ backgroundColor: ["#d0d3d8", "#5e6ad2", "#5e6ad2", "#d0d3d8"] }}
              transition={{ duration: 9, times: [Math.max(i * 0.25 - 0.04, 0), Math.min(i * 0.25 + 0.02, 1), Math.min(i * 0.25 + 0.22, 1), Math.min(i * 0.25 + 0.27, 1)], repeat: Infinity }}
              className="h-2 w-2 rounded-full"
            />
            <span className="text-[8.5px] font-medium uppercase tracking-wide text-ink-tertiary">{stop}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CULL_PHOTOS = [
  { src: "/imgs/landing/wedding-couple.jpg", label: "BR-0142" },
  { src: "/imgs/landing/portrait-woman.jpg", label: "BR-0143" },
  { src: "/imgs/landing/dog.jpg", label: "BR-0144" },
];

function CullDemo() {
  const [index, setIndex] = useState(0);
  const [exit, setExit] = useState<"left" | "right" | null>(null);
  const [touched, setTouched] = useState(false);
  const [kept, setKept] = useState(87);
  const [rejected, setRejected] = useState(19);
  const x = useMotionValue(0);
  const keepOpacity = useTransform(x, [18, 110], [0, 1]);
  const rejectOpacity = useTransform(x, [-18, -110], [0, 1]);
  const rotate = useTransform(x, [-160, 160], [-9, 9]);

  const decide = (dir: "left" | "right") => {
    setTouched(true);
    setExit(dir);
  };

  return (
    <div className="relative flex h-full min-h-[300px] flex-col items-center justify-center gap-4 overflow-hidden p-4 md:min-h-full">
      <div className="relative h-56 w-44">
        {CULL_PHOTOS.map((photo, i) => {
          const stackPos = (i - index + CULL_PHOTOS.length) % CULL_PHOTOS.length;
          if (stackPos > 2) return null;
          const isTop = stackPos === 0;
          return (
            <motion.div
              key={photo.src}
              className="absolute inset-0 rounded-lg border border-hairline bg-white p-1.5 shadow-[0_14px_30px_rgb(15,16,17,0.14)]"
              style={
                isTop
                  ? { x, rotate, zIndex: 3 }
                  : { zIndex: 3 - stackPos, scale: 1 - stackPos * 0.05, y: stackPos * 9, rotate: stackPos % 2 ? 1.6 : -1.4 }
              }
              animate={isTop && exit ? { x: exit === "left" ? -320 : 320, opacity: 0, rotate: exit === "left" ? -16 : 16 } : undefined}
              transition={isTop ? { type: "spring", stiffness: 320, damping: 30 } : undefined}
              drag={isTop && !exit ? "x" : false}
              dragSnapToOrigin
              onDragStart={() => setTouched(true)}
              onDragEnd={(_, info: PanInfo) => {
                if (Math.abs(info.offset.x) > 70) decide(info.offset.x > 0 ? "right" : "left");
              }}
              onAnimationComplete={() => {
                if (isTop && exit) {
                  if (exit === "right") setKept((k) => k + 1);
                  else setRejected((r) => r + 1);
                  setIndex((v) => (v + 1) % CULL_PHOTOS.length);
                  setExit(null);
                  x.set(0);
                }
              }}
            >
              {isTop ? (
                <motion.div animate={touched || exit ? {} : { x: [0, 22, 0, -22, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}>
                  <img src={photo.src} alt="" aria-hidden loading="lazy" className="h-44 w-full select-none rounded-md object-cover" />
                  <p className="pt-1 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400">{photo.label}</p>
                </motion.div>
              ) : (
                <img src={photo.src} alt="" aria-hidden loading="lazy" className="h-44 w-full select-none rounded-md object-cover opacity-80" />
              )}
            </motion.div>
          );
        })}
        <motion.span style={{ opacity: keepOpacity }} className="absolute -left-2 top-2 z-10 rounded-full bg-success px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
          Keep
        </motion.span>
        <motion.span style={{ opacity: rejectOpacity }} className="absolute -right-2 top-2 z-10 rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
          Pass
        </motion.span>
      </div>
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
        <span className="rounded-full bg-success/10 px-2.5 py-1 text-success-text">Keep {kept}</span>
        <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">Pass {rejected}</span>
      </div>
      <p className="text-center text-[10px] text-ink-tertiary">drag the print — it's a real swipe</p>
    </div>
  );
}

function VaultDemo() {
  const [filled, setFilled] = useState(0);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    if (revoked) return;
    const timer = setInterval(() => setFilled((v) => (v >= 5 ? 0 : v + 1)), 480);
    return () => clearInterval(timer);
  }, [revoked]);

  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="flex items-center gap-3">
        <img src="/imgs/landing/newborn.jpg" alt="" aria-hidden loading="lazy" className="h-12 w-12 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-ink">Wells — Newborn</p>
          <p className="font-mono text-[10px] text-ink-tertiary">gallery.snap/W-8F2K</p>
        </div>
        {filled >= 4 && !revoked ? (
          <span className="rounded-full bg-success/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-success-text">Open</span>
        ) : (
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-2 w-2 rounded-full transition-colors ${i < filled && !revoked ? "bg-primary" : "bg-surface-4"}`} />
            ))}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setRevoked((v) => !v)}
        className={`w-full rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
          revoked
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-hairline bg-surface-1 text-ink hover:bg-surface-2"
        }`}
      >
        {revoked ? "Link revoked — access killed instantly" : "Revoke this link"}
      </button>
    </div>
  );
}

const SESSION_TYPES = ["Wedding · 8h · $500 deposit", "Family · 1h", "Newborn · 2h"];

function BookingDemo() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setActive((v) => (v + 1) % SESSION_TYPES.length), 2000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="flex flex-wrap gap-1.5">
        {SESSION_TYPES.map((t, i) => (
          <span
            key={t}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              i === active ? "bg-primary text-white" : "bg-surface-2 text-ink-subtle"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 21 }, (_, i) => (
          <span
            key={i}
            className={`grid h-6 place-items-center rounded-md text-[9px] ${
              i === 12
                ? "bg-primary font-bold text-white shadow-[0_0_0_3px_rgb(94,106,210,0.18)]"
                : i % 7 === 5 || i % 7 === 6
                  ? "bg-surface-2 text-ink-tertiary"
                  : "bg-surface-1 text-ink-subtle"
            }`}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">Sat 13 · 10:00 — deposit collected at booking</p>
    </div>
  );
}

const BRAND_COLORS = ["#5e6ad2", "#0e9384", "#d97706", "#e11d48"];

function BrandDemo() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setActive((v) => (v + 1) % BRAND_COLORS.length), 1800);
    return () => clearInterval(timer);
  }, []);
  const accent = BRAND_COLORS[active];
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="rounded-xl border border-hairline p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="h-5 w-5 rounded-md" style={{ backgroundColor: accent, transition: "background-color .6s" }} />
          <span className="text-[11px] font-semibold text-ink">Love & Light Studio</span>
        </div>
        <div className="mb-2.5 h-1.5 w-full rounded-full bg-surface-2">
          <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: accent, transition: "background-color .6s" }} />
        </div>
        <div className="rounded-md px-3 py-1.5 text-center text-[10px] font-semibold text-white" style={{ backgroundColor: accent, transition: "background-color .6s" }}>
          Book your date
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {BRAND_COLORS.map((c, i) => (
          <span key={c} className={`h-4 w-4 rounded-full transition-all ${i === active ? "ring-2 ring-offset-2 ring-ink/30" : "opacity-50"}`} style={{ backgroundColor: c }} />
        ))}
      </div>
    </div>
  );
}

const EMAIL_TEXT = "— your gallery is ready. 87 photos, full resolution, no watermark.";

function EmailDemo() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCount((v) => (v > EMAIL_TEXT.length + 14 ? 0 : v + 1)), 42);
    return () => clearInterval(timer);
  }, []);
  const typed = EMAIL_TEXT.slice(0, Math.min(count, EMAIL_TEXT.length));
  return (
    <div className="flex h-full flex-col justify-center p-4">
      <div className="rounded-xl border border-hairline p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] text-ink-tertiary">to: maya@gmail.com</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">template</span>
        </div>
        <p className="min-h-[42px] text-[12px] leading-relaxed text-ink">
          Hi{" "}
          <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${count > 0 ? "border-lavender/40 bg-primary/10 text-primary" : "border-hairline text-ink-tertiary"}`}>
            {"{{first_name}}"}
          </span>{" "}
          {typed}
          <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary align-middle" />
        </p>
      </div>
    </div>
  );
}

const DOMAIN = "gallery.loveandlightphoto.com";

function DomainDemo() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCount((v) => (v > DOMAIN.length + 12 ? 0 : v + 1)), 65);
    return () => clearInterval(timer);
  }, []);
  const done = count >= DOMAIN.length;
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="flex items-center gap-2 rounded-full border border-hairline bg-surface-1 px-3.5 py-2">
        <span className={`h-4 w-4 shrink-0 rounded-full transition-colors ${done ? "bg-success" : "bg-surface-4"}`} />
        <span className="truncate font-mono text-[11px] text-ink">
          https://{DOMAIN.slice(0, Math.min(count, DOMAIN.length))}
          {!done && <span className="inline-block h-3 w-[2px] animate-pulse bg-primary align-middle" />}
        </span>
        {done && (
          <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-success-text">
            SSL ✓
          </motion.span>
        )}
      </div>
      <p className="text-center text-[10px] text-ink-tertiary">one CNAME record · SSL auto-renewed</p>
    </div>
  );
}

const FORM_FIELDS = ["Full name", "Email", "How did you two meet?"];

function FormsDemo() {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 p-4">
      {FORM_FIELDS.map((field, i) => (
        <motion.div
          key={field}
          animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -4] }}
          transition={{ duration: 7, times: [i * 0.08, i * 0.08 + 0.14, 0.88, 1], repeat: Infinity }}
          className="rounded-lg border border-hairline px-3 py-2"
        >
          <span className="text-[11px] text-ink-tertiary">{field}</span>
        </motion.div>
      ))}
      <motion.div
        animate={{ opacity: [0, 1, 1, 0], scale: [0.96, 1, 1, 0.98] }}
        transition={{ duration: 7, times: [0.3, 0.4, 0.88, 1], repeat: Infinity }}
        className="rounded-lg bg-primary px-3 py-2 text-center text-[11px] font-semibold text-white"
      >
        Send inquiry
      </motion.div>
    </div>
  );
}

function ContractDemo() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="rounded-xl border border-hairline p-3.5">
        <p className="mb-1 text-[11px] font-semibold text-ink">Wedding photography agreement</p>
        <p className="mb-3 text-[10px] text-ink-tertiary">Maya Chen + Jordan Wells · $2,400 · Sep 12</p>
        <svg viewBox="0 0 220 44" className="h-11 w-full">
          <line x1="8" y1="38" x2="212" y2="38" stroke="#d0d3d8" strokeWidth="1.5" />
          <motion.path
            d="M12 30 C 30 6, 44 40, 60 24 S 92 8, 104 26 S 132 40, 148 18 S 186 28, 206 14"
            fill="none"
            stroke="#5e6ad2"
            strokeWidth="2.4"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1] }}
            transition={{ duration: 4.6, times: [0, 0.4, 1], repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
          />
        </svg>
        <motion.span
          animate={{ opacity: [0, 0, 1, 1, 0], y: [6, 6, 0, 0, 0] }}
          transition={{ duration: 4.6, times: [0, 0.42, 0.52, 0.94, 1], repeat: Infinity, repeatDelay: 1.2 }}
          className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-success-text"
        >
          ✓ Signed by both parties
        </motion.span>
      </div>
    </div>
  );
}

function RawDemo() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {[
        { name: "IMG_4021.CR3", size: "48 MB", state: "Hot · 5mo left", width: "82%" },
        { name: "IMG_4022.CR3", size: "47 MB", state: "Hot · 5mo left", width: "80%" },
      ].map((row) => (
        <div key={row.name} className="rounded-lg border border-hairline px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10.5px] text-ink">{row.name}</span>
            <span className="font-mono text-[9.5px] uppercase tracking-wide text-ink-tertiary">{row.state}</span>
          </div>
          <div className="h-1 w-full rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary/70" style={{ width: row.width }} />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-primary">Never silently deleted</span>
        <motion.span animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-white">
          Extend 6 months
        </motion.span>
      </div>
    </div>
  );
}
