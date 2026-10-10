"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";

import { captureUtm } from "./utm";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Loads the Meta Pixel (no-op without NEXT_PUBLIC_META_PIXEL_ID) and records UTMs on every route. */
export function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    captureUtm();
    window.fbq?.("track", "PageView");
  }, [pathname]);

  if (!PIXEL_ID) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');`}
    </Script>
  );
}
