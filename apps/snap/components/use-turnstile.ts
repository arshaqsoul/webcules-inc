"use client";

/* One Turnstile hook for every client surface (WEB-333). On our own hosts it
 * renders the native widget; on a studio's custom hostname it embeds the
 * main-origin bridge page instead (see lib/turnstile-bridge.ts), so custom
 * domains never need registering with Turnstile. */
import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_ORIGIN } from "@/lib/hosts";
import { TS_RESET_TYPE, bridgeUrl, needsBridge, parseBridgeMessage } from "@/lib/turnstile-bridge";

type TurnstileApi = {
  render: (el: string | HTMLElement, opts: { sitekey: string; callback: (t: string) => void }) => string;
  reset: (id?: string) => void;
};
const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

export function useTurnstile(siteKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    if (needsBridge(window.location.hostname)) {
      const mount = ref.current;
      if (!mount) return;
      const f = document.createElement("iframe");
      f.src = bridgeUrl(window.location.hostname, PUBLIC_ORIGIN);
      f.title = "Verification";
      f.setAttribute("scrolling", "no");
      f.style.cssText = "border:0;width:100%;max-width:300px;height:70px;display:block";
      mount.appendChild(f);
      frame.current = f;
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== PUBLIC_ORIGIN || e.source !== f.contentWindow) return;
        const m = parseBridgeMessage(e.data);
        if (!m) return;
        setToken(m.kind === "token" ? m.token : "");
      };
      window.addEventListener("message", onMessage);
      return () => {
        cancelled = true;
        window.removeEventListener("message", onMessage);
        f.remove();
        frame.current = null;
      };
    }

    if (!document.querySelector("script[data-snap-turnstile]")) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.dataset.snapTurnstile = "1";
      document.head.appendChild(s);
    }
    const tryRender = () => {
      const t = api();
      if (cancelled || widgetId.current || !t || !ref.current) return;
      widgetId.current = t.render(ref.current, { sitekey: siteKey, callback: (tok) => setToken(tok) });
    };
    tryRender();
    const iv = setInterval(() => {
      if (widgetId.current) return clearInterval(iv);
      tryRender();
    }, 400);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [siteKey]);

  /** Forget the token and get a fresh challenge (after a code is sent, etc). */
  const reset = useCallback(() => {
    setToken("");
    if (frame.current?.contentWindow) {
      frame.current.contentWindow.postMessage({ type: TS_RESET_TYPE }, PUBLIC_ORIGIN);
    } else {
      api()?.reset(widgetId.current ?? undefined);
    }
  }, []);

  return { ref, token, reset };
}
