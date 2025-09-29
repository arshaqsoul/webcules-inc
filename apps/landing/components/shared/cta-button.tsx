"use client";

import { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";
export const CTAButton = ({ pricing }: { pricing: boolean }) => {
  useEffect(() => {
    (async function () {
      const cal = await getCalApi({});
      cal("ui", {
        styles: { branding: { brandColor: "#000000" } },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    })();
  }, []);
  return (
    <button
      data-cal-namespace=""
      data-cal-link="webcules/discovery"
      data-cal-config='{"layout":"month_view"}'
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
