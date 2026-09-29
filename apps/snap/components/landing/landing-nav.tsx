"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";

const LINKS = [
  { href: "#story", label: "Story" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
];

/** Floating pill nav — Linear's floating chrome, quiet over photography. */
export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => setSolid(v > 40));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={mounted ? { y: 0, opacity: 1 } : undefined}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="fixed inset-x-0 top-4 z-[80] flex justify-center px-4"
    >
      <nav
        aria-label="Main"
        className={`flex items-center gap-1 rounded-full border py-1.5 pl-2 pr-1.5 transition-colors duration-300 ${
          solid
            ? "border-hairline bg-background/80 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl"
            : "border-white/20 bg-white/10 text-white backdrop-blur-md"
        }`}
      >
        <Link href="/" className="mr-1 flex items-center gap-2 rounded-full px-1.5 py-1">
          <span
            aria-hidden
            className={`grid h-6 w-6 place-items-center rounded-[7px] ${
              solid ? "bg-primary text-white" : "bg-white/90 text-[#5e6ad2]"
            }`}
          >
            <ApertureMark />
          </span>
          <span className={`text-sm font-semibold tracking-[-0.2px] ${solid ? "text-ink" : "text-white"}`}>
            Snap
          </span>
        </Link>
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className={`hidden rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:block ${
              solid ? "text-ink-subtle hover:bg-surface-2 hover:text-ink" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {l.label}
          </a>
        ))}
        <Link
          href={signedIn ? "/dashboard" : "/signup"}
          className={`ml-1 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
            solid
              ? "bg-primary text-white hover:bg-lavender-hover"
              : "bg-white text-[#1a1d2e] hover:bg-white/90"
          }`}
        >
          {signedIn ? "Open studio" : "Start free"}
        </Link>
      </nav>
    </motion.header>
  );
}

function ApertureMark() {
  // Same geometry as public/icon.svg — six-blade iris, 60° symmetry.
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <circle cx="12" cy="12" r="9.75" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 8.2 15.65 21.04M15.29 10.1 6 19.68M15.29 13.9 2.34 10.64M12 15.8 8.35 2.96M8.71 13.9 18 4.32M8.71 10.1 21.66 13.36"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
