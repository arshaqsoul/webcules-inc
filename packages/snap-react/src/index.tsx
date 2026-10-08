/* @webcules/snap-react — React components for embedding Snap widgets
 * (WEB-169). Each component wraps the embed loader's imperative
 * window.Snap.mount/destroy API with framework-correct lifecycle: the widget
 * mounts into a placeholder div once the loader script has resolved and is
 * destroyed on unmount — which also makes React 18/19 StrictMode's
 * double-invoked effects safe (mount() recreates after destroy()).
 *
 * The raw script-tag snippet from Settings → Embeds works in any framework
 * without this package; this exists for React apps that prefer components
 * over global script tags. */
import { useEffect, useRef, type CSSProperties } from "react";

export const SNAP_LOADER_SRC = "https://snaphq.app/embed/loader.js";

export type SnapTheme = "light" | "dark" | "auto";

export type SnapWidgetOptions = {
  /** Studio embed key (Settings → Embeds in the Snap dashboard). */
  apiKey: string;
  theme?: SnapTheme;
  /** Brand accent override, 6-digit hex (e.g. "#5e6ad2"). */
  accent?: string;
  /** Corner radius (e.g. "12px", "0.75rem", "50%"). */
  radius?: string;
  /** CSS font stack override. */
  fontFamily?: string;
  /** Sample the host page's font/text/background so the widget blends in. */
  inherit?: boolean;
};

type SnapGlobal = {
  version: string;
  mount: (target: HTMLElement | string, opts?: Record<string, unknown>) => HTMLElement | null;
  destroy: (target: HTMLElement | string) => void;
};

declare global {
  interface Window {
    Snap?: SnapGlobal;
  }
}

let loaderPromise: Promise<SnapGlobal | null> | null = null;

/** Injects the loader <script> once per document and resolves once the
 * window.Snap API is available. Safe to call from many components. */
export function loadSnap(): Promise<SnapGlobal | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Snap) return Promise.resolve(window.Snap);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<SnapGlobal | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SNAP_LOADER_SRC}"]`);
    const settle = () => resolve(window.Snap ?? null);
    if (existing) {
      existing.addEventListener("load", settle, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      // The script may have already loaded between React mounting and this call.
      if (window.Snap) settle();
      return;
    }
    const script = document.createElement("script");
    script.src = SNAP_LOADER_SRC;
    script.async = true;
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    document.head.appendChild(script);
  });
  return loaderPromise;
}

function buildOptions(
  widget: "contact" | "calendar" | "calendar-button",
  opts: SnapWidgetOptions,
  label?: string,
): Record<string, unknown> {
  const o: Record<string, unknown> = { widget, key: opts.apiKey };
  if (opts.theme) o.theme = opts.theme;
  if (opts.accent) o.accent = opts.accent;
  if (opts.radius) o.radius = opts.radius;
  if (opts.fontFamily) o.fontFamily = opts.fontFamily;
  if (opts.inherit) o.inherit = "auto";
  if (label !== undefined) o.label = label;
  return o;
}

function useSnapWidget(
  widget: "contact" | "calendar" | "calendar-button",
  opts: SnapWidgetOptions,
  label?: string,
) {
  const ref = useRef<HTMLDivElement>(null);
  const { apiKey, theme, accent, radius, fontFamily, inherit } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    void loadSnap().then((snap) => {
      if (cancelled || !snap) return;
      snap.mount(el, buildOptions(widget, { apiKey, theme, accent, radius, fontFamily, inherit }, label));
    });
    return () => {
      cancelled = true;
      window.Snap?.destroy(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps cover every option that changes the mount
  }, [widget, apiKey, theme, accent, radius, fontFamily, inherit, label]);
  return ref;
}

/** Inline contact form — inquiries land in the studio's Snap inbox. */
export function SnapContactForm(props: SnapWidgetOptions & { style?: CSSProperties }) {
  const { style, ...opts } = props;
  const ref = useSnapWidget("contact", opts);
  return <div ref={ref} style={style} />;
}

/** Inline booking calendar — availability, holds and payment in one flow. */
export function SnapCalendar(props: SnapWidgetOptions & { style?: CSSProperties }) {
  const { style, ...opts } = props;
  const ref = useSnapWidget("calendar", opts);
  return <div ref={ref} style={style} />;
}

/** Button that opens the booking calendar in a modal overlay. */
export function SnapCalendarButton(
  props: SnapWidgetOptions & { label?: string; style?: CSSProperties },
) {
  const { style, label = "Book a session", ...opts } = props;
  const ref = useSnapWidget("calendar-button", opts, label);
  return <div ref={ref} style={style} />;
}
