"use client";

import { getCalApi } from "@calcom/embed-react";
import { cn } from "@webcules/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { captureUtm } from "@/components/analytics/utm";

let calReady: Promise<void> | null = null;
function initCal() {
  calReady ??= (async () => {
    const cal = await getCalApi({});
    cal("ui", {
      styles: { branding: { brandColor: "#6366f1" } },
      hideEventTypeDetails: false,
      layout: "month_view",
    });
    // Register once for the whole page, not once per button.
    cal("on", {
      action: "bookingSuccessful",
      callback: () => window.fbq?.("track", "Lead"),
    });
  })();
  return calReady;
}

/** Cal.com booking config, carrying any captured UTM parameters. */
export function useCalConfig() {
  const [config, setConfig] = useState('{"layout":"month_view"}');
  useEffect(() => {
    setConfig(JSON.stringify({ layout: "month_view", ...captureUtm() }));
  }, []);
  return config;
}

/** Opens the Cal.com discovery-call booking modal. */
export const CTAButton = ({
  variant = "primary",
  size = "md",
  className,
  children = "Book a discovery call",
}: {
  /** Kept for existing call sites; the visual no longer depends on it. */
  pricing?: boolean;
  variant?: "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  children?: ReactNode;
}) => {
  const calConfig = useCalConfig();
  useEffect(() => {
    initCal().catch(() => {});
  }, []);
  return (
    <button
      type="button"
      data-cal-namespace=""
      data-cal-link="webcules/discovery"
      data-cal-config={calConfig}
      className={cn(
        "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-200 active:scale-[0.98]",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-11 px-6 text-sm",
        size === "lg" && "h-13 px-8 text-base",
        variant === "primary" &&
          "bg-white text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.4),0_8px_30px_-8px_rgba(139,141,255,0.6)] hover:bg-indigo-50 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.6),0_12px_40px_-8px_rgba(139,141,255,0.8)]",
        variant === "ghost" &&
          "border border-white/15 bg-white/[0.04] text-white hover:border-white/30 hover:bg-white/[0.08]",
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
};
