"use client";

/* Dashboard body: the signed-in user's saved playground configs as live
 * preview cards — reopen, copy JSON, delete (two-step confirm). Loads from
 * /api/configs and bounces to the login page when signed out. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";

import { useReplayPendingSave } from "@/components/auth/replay-pending-save";
import { LIBRARY } from "@/components/library/manifest.gen";
import { renderPreview } from "@/components/library/preview";
import { signOut, useSession } from "@/lib/auth-client";
import {
  deleteConfig,
  fetchConfigs,
  type SavedConfig,
} from "@/lib/saved-configs";

function prettyComponent(name: string): string {
  return LIBRARY.find((c) => c.name === name)?.title ?? name;
}

/* Relative "Updated …" label without a date dependency. */
function relativeDate(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round((time - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  return new Date(time).toLocaleDateString();
}

export function SavedConfigs() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);
  const [configs, setConfigs] = useState<SavedConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Magic-link / OAuth callbacks land straight here — finish a save parked
   * while signed out before anything else. */
  useReplayPendingSave(!isPending && signedIn);

  useEffect(() => {
    if (!isPending && !signedIn) router.replace("/login?redirect=/dashboard");
  }, [isPending, signedIn, router]);

  useEffect(() => {
    if (isPending || !signedIn) return;
    let alive = true;
    fetchConfigs()
      .then((list) => {
        if (alive) setConfigs(list);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("(401)")) {
          router.replace("/login?redirect=/dashboard");
          return;
        }
        setError("Could not load your saved configs. Try refreshing.");
      });
    return () => {
      alive = false;
    };
  }, [isPending, signedIn, router]);

  const signOutAndGoHome = async () => {
    try {
      await signOut();
    } finally {
      router.push("/");
    }
  };

  if (isPending || !signedIn || (configs === null && !error)) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[336px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Your components
          </h1>
          {configs ? (
            <p className="mt-2 text-sm text-white/50">
              {configs.length} saved {configs.length === 1 ? "config" : "configs"}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => {
            void signOutAndGoHome();
          }}
        >
          Sign out
        </Button>
      </div>

      <p className="mt-4 text-sm text-white/50">
        Every save keeps its exact prop values — reopen one to continue where
        you left off.{" "}
        <Link
          href="/components"
          className="text-violet-300 underline-offset-4 transition-colors hover:text-violet-200 hover:underline"
        >
          Open the playground →
        </Link>
      </p>

      {error ? <p className="mt-8 text-sm text-red-400">{error}</p> : null}

      {configs && configs.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
          <h2 className="text-lg font-medium">Nothing saved yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
            Tweak a component in the playground and hit Save — it shows up here
            with its exact config.
          </p>
          <Button
            asChild
            className="mt-6 bg-violet-500 text-white hover:bg-violet-400"
          >
            <Link href="/components">Open the playground</Link>
          </Button>
        </div>
      ) : null}

      {configs && configs.length > 0 ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {configs.map((config) => (
            <SavedConfigCard
              key={config.id}
              config={config}
              onDeleted={() =>
                setConfigs((cs) => (cs ?? []).filter((c) => c.id !== config.id))
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SavedConfigCard({
  config,
  onDeleted,
}: {
  config: SavedConfig;
  onDeleted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pretty = prettyComponent(config.component);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(config.config, null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteConfig(config.id);
      onDeleted();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25">
      <div className="pointer-events-none mx-3 mt-3 h-[200px] overflow-hidden rounded-xl border border-white/10">
        {renderPreview(config.component, config.config)}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-medium uppercase tracking-widest text-white/35">
          {pretty}
        </p>
        <h3
          className="mt-1 truncate font-medium text-white"
          title={config.title}
        >
          {config.title || `${pretty} config`}
        </h3>
        <p className="mt-1 text-xs text-white/40">
          Updated {relativeDate(config.updatedAt)}
        </p>

        <div className="mt-4 flex items-center gap-1.5">
          <Button asChild size="sm" variant="secondary" className="h-8 text-xs">
            <Link href={`/components/${config.component}?c=${config.id}`}>
              Open in playground
            </Link>
          </Button>
          <div className="ml-auto flex items-center">
            {confirming ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  className="h-8 px-2 text-xs text-red-400 hover:text-red-300"
                  onClick={() => {
                    void remove();
                  }}
                >
                  Sure?
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-white/40 hover:text-white"
                  aria-label="Keep it"
                  onClick={() => setConfirming(false)}
                >
                  <X className="size-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-white/40 hover:text-white"
                  aria-label="Copy config JSON"
                  onClick={() => {
                    void copy();
                  }}
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-white/40 hover:text-red-400"
                  aria-label="Delete config"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
