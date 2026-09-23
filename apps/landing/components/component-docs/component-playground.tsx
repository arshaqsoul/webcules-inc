"use client";

/* The component playground: owns the collapsible shell (components list on
 * the left, prop toolbox on the right), the live config state shared by the
 * toolbox and preview, the copy/save actions, all doc sections, and the
 * prev/next navigation.
 *
 * Panels are in-flow asides on desktop (lg = components, xl = toolbox) and
 * slide-in drawers with a backdrop below those breakpoints. Defaults follow
 * the breakpoint on mount and when it changes. */
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  PanelLeft,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@webcules/ui/lib/utils";
import { Button } from "@webcules/ui/components/button";

import styles from "./playground.module.css";
import { CodeBlock } from "@/components/component-docs/code-block";
import { InstallTabs } from "@/components/component-docs/install-tabs";
import { Toolbox } from "@/components/component-docs/toolbox";
import { ComponentsSidebarContent } from "@/components/component-docs/components-sidebar";
import {
  copyCodeFor,
  copyConfigFor,
  defaultsOf,
  type RegistryEntry,
} from "@/components/library/registry";
import { renderPreview } from "@/components/library/preview";

import type { ConfigValues, SavedConfig } from "@/lib/saved-configs";
import { parkPendingSave, saveConfig } from "@/lib/saved-configs";

const LG = "(min-width: 1024px)";
const XL = "(min-width: 1280px)";

export type WorkbenchEntry = {
  name: string;
  title: string;
  tagline: string;
  description: string;
  tags: string[];
};

export type WorkbenchSibling = { name: string; title: string } | null;

type CopyButtonProps = { label: string; text: string };

function CopyButton({ label, text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function PanelChip({
  open,
  onClick,
  label,
  icon,
  side,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  side: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg shadow-black/30 transition-colors",
        side === "right" && "flex-row-reverse",
        open
          ? "border-violet-400/40 bg-[oklch(0.171_0.1063_276.43)] text-white"
          : "border-white/10 bg-[oklch(0.171_0.1063_276.43)] text-white/50 hover:border-white/25 hover:text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function ComponentPlayground({
  entry,
  registry,
  siteUrl,
  savedConfig,
  prev,
  next,
}: {
  entry: WorkbenchEntry;
  registry: RegistryEntry;
  siteUrl: string;
  /* Present when the user opened a saved config from their dashboard. */
  savedConfig?: SavedConfig | null;
  prev: WorkbenchSibling;
  next: WorkbenchSibling;
}) {
  const router = useRouter();
  const defaults = useMemo(() => defaultsOf(registry), [registry]);
  const [values, setValues] = useState<ConfigValues>(() => ({
    ...defaults,
    ...(savedConfig?.config ?? {}),
  }));
  const [savedId, setSavedId] = useState<string | null>(savedConfig?.id ?? null);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Collapsible panel state — breakpoint-aware defaults. */
  const [mounted, setMounted] = useState(false);
  const [isLg, setIsLg] = useState(false);
  const [isXl, setIsXl] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const lg = window.matchMedia(LG);
    const xl = window.matchMedia(XL);
    const apply = () => {
      setIsLg(lg.matches);
      setIsXl(xl.matches);
      setNavOpen(lg.matches);
      setToolsOpen(xl.matches);
    };
    apply();
    lg.addEventListener("change", apply);
    xl.addEventListener("change", apply);
    return () => {
      lg.removeEventListener("change", apply);
      xl.removeEventListener("change", apply);
    };
  }, []);

  const drawerOpen =
    mounted && ((navOpen && !isLg) || (toolsOpen && !isXl));

  /* Scroll lock while a drawer is up; Escape closes drawers. */
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNavOpen(false);
        setToolsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const set = (prop: string, v: ConfigValues[string]) =>
    setValues((c) => ({ ...c, [prop]: v }));
  const reset = () => setValues(defaults);

  const toolbox = (
    <Toolbox entry={registry} values={values} onChange={set} onReset={reset} />
  );

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveConfig({
        id: savedId ?? undefined,
        component: entry.name,
        config: values,
        title: `${entry.title} config`,
      });
      if (!result.ok && result.unauthorized) {
        /* Signed out: park the config, let the login page replay it. */
        parkPendingSave({
          component: entry.name,
          config: values,
          title: `${entry.title} config`,
        });
        router.push(
          `/login?redirect=${encodeURIComponent(
            savedId
              ? `/components/${entry.name}?c=${savedId}`
              : `/components/${entry.name}`,
          )}`,
        );
        return;
      }
      setSavedId(result.ok ? result.id : null);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2400);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const modifiedCount = registry.props.filter(
    (p) => values[p.prop] !== undefined && values[p.prop] !== p.default,
  ).length;

  return (
    <>
      {/* Floating panel toggles — stick below the site nav on scroll. The
          row is click-through; only the opaque chips are interactive. */}
      <div className="pointer-events-none sticky top-20 z-30 mb-6 flex items-center justify-between gap-3">
        <PanelChip
          open={navOpen}
          onClick={() => setNavOpen((v) => !v)}
          label="Components"
          icon={<PanelLeft className="size-3.5" />}
          side="left"
        />
        <PanelChip
          open={toolsOpen}
          onClick={() => setToolsOpen((v) => !v)}
          label="Toolbox"
          icon={<SlidersHorizontal className="size-3.5" />}
          side="right"
        />
      </div>

      <div className="flex gap-6 xl:gap-8">
        {/* Left panel — components list (desktop: in flow) */}
        {navOpen && isLg ? (
          <aside className="sticky top-32 hidden h-fit w-56 shrink-0 lg:block">
            <ComponentsSidebarContent />
          </aside>
        ) : null}

        {/* Main column */}
        <main className="min-w-0 flex-1">
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tight">{entry.title}</h1>
            {entry.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/60"
              >
                {t}
              </span>
            ))}
          </div>
          <p className="mb-3 max-w-2xl text-white/60">{entry.tagline}</p>
          <p className="mb-8 max-w-2xl text-sm leading-relaxed text-white/55">
            {entry.description}
          </p>

          {/* Preview + actions */}
          <section className="mb-14">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-lg font-medium">Playground</h2>
              {modifiedCount > 0 ? (
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 text-xs text-violet-300">
                  {modifiedCount} prop{modifiedCount === 1 ? "" : "s"} tweaked
                </span>
              ) : null}
              <CopyButton label="Copy code" text={copyCodeFor(registry, values)} />
              <CopyButton label="Copy config" text={copyConfigFor(registry, values)} />
              <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : justSaved ? (
                  <Check className="size-3.5" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {saving ? "Saving…" : savedId ? "Saved — update" : "Save"}
              </Button>
            </div>
            {justSaved ? (
              <p className="mb-3 flex items-center gap-3 text-xs text-emerald-300">
                Saved to your dashboard.
                <Link href="/dashboard" className="underline underline-offset-2 hover:text-emerald-200">
                  Open dashboard →
                </Link>
              </p>
            ) : null}
            {saveError ? (
              <p className="mb-3 text-xs text-red-400">{saveError}</p>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-white/10">
              {renderPreview(entry.name, values)}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/40">
              Tweak the props in the toolbox — the preview updates in realtime.
              &ldquo;Copy code&rdquo; gives you the exact JSX for the current
              tweaks.
            </p>
          </section>

          <section className="mb-14">
            <h2 className="mb-4 text-lg font-medium">Installation</h2>
            <InstallTabs siteUrl={siteUrl} name={entry.name} />
          </section>

          <section className="mb-14">
            <h2 className="mb-4 text-lg font-medium">Usage</h2>
            <p className="mb-4 text-sm leading-relaxed text-white/60">
              Import the component and drop it in — every prop in the toolbox is
              a regular React prop:
            </p>
            <CodeBlock code={registry.docs.usage} title="hero.tsx" />
          </section>

          {registry.docs.highlights ? (
            <section className="mb-14">
              <h2 className="mb-4 text-lg font-medium">Highlights</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-white/60">
                {registry.docs.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {registry.docs.examples?.map((ex) => (
            <section key={ex.title} className="mb-14">
              <h2 className="mb-4 text-lg font-medium">Example — {ex.title}</h2>
              {ex.description ? (
                <p className="mb-4 text-sm leading-relaxed text-white/55">
                  {ex.description}
                </p>
              ) : null}
              <CodeBlock code={ex.code} title="example.tsx" />
            </section>
          ))}

          <section className="mb-14">
            <h2 className="mb-4 text-lg font-medium">Props</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Prop</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Default</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {registry.props.map((p) => (
                    <tr key={p.prop} className="align-top">
                      <td className="px-4 py-3 font-mono text-[13px] font-medium text-white">
                        {p.prop}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-violet-300/80">
                        {p.type}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-white/50">
                        {typeof p.default === "string" ? `"${p.default}"` : String(p.default)}
                      </td>
                      <td className="px-4 py-3 text-white/70">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {registry.docs.notes ? (
            <section className="mb-14">
              <h2 className="mb-4 text-lg font-medium">Notes</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-white/60">
                {registry.docs.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Prev / next component navigation */}
          <nav className="mt-16 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/components/${prev.name}`}
                className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25"
              >
                <span className="flex items-center gap-1 text-xs text-white/40 group-hover:text-white/60">
                  <ChevronLeft className="size-3.5" /> Previous
                </span>
                <span className="mt-1 block font-medium text-white group-hover:text-violet-300">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/components/${next.name}`}
                className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 text-right transition-colors hover:border-white/25"
              >
                <span className="flex items-center justify-end gap-1 text-xs text-white/40 group-hover:text-white/60">
                  Next <ChevronRight className="size-3.5" />
                </span>
                <span className="mt-1 block font-medium text-white group-hover:text-violet-300">
                  {next.title}
                </span>
              </Link>
            ) : null}
          </nav>
        </main>

        {/* Right panel — prop toolbox (desktop: in flow) */}
        {toolsOpen && isXl ? (
          <aside
            className={cn(
              "sticky top-32 hidden h-fit max-h-[calc(100vh-10.5rem)] w-72 shrink-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-5 xl:block",
              styles.slimScroll,
            )}
          >
            {toolbox}
          </aside>
        ) : null}
      </div>

      {/* Mobile / tablet drawers */}
      {navOpen && !isLg ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setNavOpen(false)}
          />
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto bg-[oklch(0.171_0.1063_276.43)] p-5 pt-6 shadow-2xl lg:hidden",
              styles.slimScroll,
            )}
          >
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-white/35">
                Browse
              </p>
              <button
                type="button"
                aria-label="Close components panel"
                onClick={() => setNavOpen(false)}
                className="rounded-md p-1 text-white/50 transition-colors hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <ComponentsSidebarContent onNavigate={() => setNavOpen(false)} />
          </aside>
        </>
      ) : null}

      {toolsOpen && !isXl ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm xl:hidden"
            onClick={() => setToolsOpen(false)}
          />
          <aside
            className={cn(
              "fixed inset-y-0 right-0 z-50 w-80 max-w-[88vw] overflow-y-auto bg-[oklch(0.171_0.1063_276.43)] p-5 pt-6 shadow-2xl xl:hidden",
              styles.slimScroll,
            )}
          >
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-white/35">
                Toolbox
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={reset}
                  disabled={modifiedCount === 0}
                  className="flex items-center gap-1.5 text-xs text-white/50 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-30"
                >
                  Reset{modifiedCount ? ` (${modifiedCount})` : ""}
                </button>
                <button
                  type="button"
                  aria-label="Close toolbox"
                  onClick={() => setToolsOpen(false)}
                  className="rounded-md p-1 text-white/50 transition-colors hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <Toolbox
              entry={registry}
              values={values}
              onChange={set}
              onReset={reset}
              hideHeading
            />
          </aside>
        </>
      ) : null}
    </>
  );
}
