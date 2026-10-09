"use client";
import { cn } from "@webcules/ui/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/lib/auth-client";

import { CTAButton } from "./cta-button";
import Logo from "./logo";

const apps = [
  {
    name: "Snap",
    link: "https://snaphq.app",
    description: "Photographer studio platform: galleries, bookings and delivery.",
  },
  {
    name: "tru",
    link: "https://tru.webcules.com",
    description: "Workflow automation on the edge. Pay per run, no subscription.",
  },
  {
    name: "Backgrounds",
    link: "https://backgrounds.webcules.com",
    description: "High-quality AI-crafted design backdrops for creatives.",
  },
];

/** Single source of truth for the site navigation. */
export const WEBNCULES_NAV_ITEMS = [
  { name: "Services", link: "/#services" },
  { name: "AI", link: "/#ai" },
  { name: "Work", link: "/#work" },
  { name: "Process", link: "/#process" },
  { name: "Pricing", link: "/#pricing" },
  { name: "Components", link: "/components" },
  { name: "Blog", link: "/posts" },
  { name: "Contact", link: "/contact" },
];

const linkClass =
  "rounded-full px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white";

const AppsMenu = () => (
  <div className="group relative">
    <button
      type="button"
      className={cn(linkClass, "flex items-center gap-1")}
      aria-haspopup="menu"
    >
      Apps
      <ChevronDown className="size-3.5 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
    </button>
    <div className="invisible absolute left-1/2 top-full z-30 w-80 -translate-x-1/2 translate-y-1 pt-3 opacity-0 transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0c26]/95 p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        {apps.map((app) => (
          <a
            key={app.name}
            href={app.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl p-3 transition-colors hover:bg-white/[0.06]"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-white">
              {app.name}
              <ArrowUpRight className="size-3.5 text-slate-500" />
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
              {app.description}
            </span>
          </a>
        ))}
      </div>
    </div>
  </div>
);

/* Auth-aware link: Dashboard when signed in, Sign in when not. */
const AuthLink = ({ className }: { className?: string }) => {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  return (
    <Link
      href={session ? "/dashboard" : "/login"}
      className={cn(linkClass, className)}
    >
      {session ? "Dashboard" : "Sign in"}
    </Link>
  );
};

export const WebculesNav = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <div
        className={cn(
          "mx-auto flex h-16 max-w-6xl items-center justify-between rounded-full border pl-3 pr-3 transition-all duration-300",
          scrolled || open
            ? "border-white/10 bg-[#0a0920]/75 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <Link href="/" aria-label="Webcules home" className="flex items-center">
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-0.5 lg:flex"
        >
          {WEBNCULES_NAV_ITEMS.slice(0, 5).map((item) => (
            <Link key={item.name} href={item.link} className={linkClass}>
              {item.name}
            </Link>
          ))}
          <AppsMenu />
          {WEBNCULES_NAV_ITEMS.slice(5).map((item) => (
            <Link key={item.name} href={item.link} className={linkClass}>
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <AuthLink className="hidden lg:block" />
          <CTAButton size="sm" className="hidden sm:inline-flex">
            Book a call
          </CTAButton>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex size-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 max-h-[calc(100dvh-6rem)] max-w-6xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0920]/95 p-4 backdrop-blur-xl lg:hidden"
          >
            {WEBNCULES_NAV_ITEMS.map((item) => (
              <Link
                key={item.name}
                href={item.link}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-base text-slate-200 hover:bg-white/[0.06]"
              >
                {item.name}
              </Link>
            ))}
            <p className="px-4 pb-1 pt-4 text-xs uppercase tracking-[0.18em] text-slate-500">
              Apps
            </p>
            {apps.map((app) => (
              <a
                key={app.name}
                href={app.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl px-4 py-2.5 hover:bg-white/[0.06]"
              >
                <span className="flex items-center gap-1.5 text-sm text-slate-200">
                  {app.name}
                  <ArrowUpRight className="size-3.5 text-slate-500" />
                </span>
                <span className="block text-xs text-slate-500">
                  {app.description}
                </span>
              </a>
            ))}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 px-1 pt-4">
              <AuthLink />
              <CTAButton size="sm">Book a call</CTAButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
