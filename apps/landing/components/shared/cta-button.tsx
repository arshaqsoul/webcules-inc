"use client";

import { getCalApi } from "@calcom/embed-react";
import { useEffect, useState } from "react";

import { captureUtm } from "@/components/analytics/utm";
export const CTAButton = ({ pricing }: { pricing: boolean }) => {
  const [calConfig, setCalConfig] = useState('{"layout":"month_view"}');
  useEffect(() => {
    (async function () {
      const cal = await getCalApi({});
      cal("ui", {
        styles: { branding: { brandColor: "#000000" } },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
      cal("on", {
        action: "bookingSuccessful",
        callback: () => window.fbq?.("track", "Lead"),
      });
      setCalConfig(JSON.stringify({ layout: "month_view", ...captureUtm() }));
    })();
  }, []);
  return (
    <button
      data-cal-namespace=""
      data-cal-link="webcules/discovery"
      data-cal-config={calConfig}
      className={`p-[3px] relative + ${pricing ? "hover:scale-x-105" : ""}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
      <div
        className={`px-4 py-2 text-sm rounded-full relative group transition duration-200 + ${
          pricing
            ? "bg-transparent text-white"
            : "bg-white text-neutral-600 hover:text-white hover:bg-transparent"
        }`}
      >
        Become a client -{">"}
      </div>
    </button>
  );
};
