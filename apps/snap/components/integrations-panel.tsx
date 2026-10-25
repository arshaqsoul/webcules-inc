"use client";

/* Settings → Integrations (WEB-186, Integrations 1/6): scoped API tokens
 * for integrations (Lightroom publish plugin, future API clients). Mint /
 * list / revoke. The raw token is shown EXACTLY ONCE at creation — the
 * server stores only its SHA-256 hash, so it can never be recovered.
 * Talks to /api/studio/integrations/tokens. */
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { useConfirm } from "@/components/confirm-provider";
import { DocHint } from "@/components/doc-hint";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ScopeOption = { id: string; label: string };

function fmt(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
}

export function IntegrationsPanel({
  initial,
  scopes,
}: {
  initial: TokenRow[];
  scopes: ScopeOption[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [tokens, setTokens] = useState(initial);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(
    [scopes[0]?.id].filter(Boolean),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ token: string; name: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const card = "rounded-[12px] border border-hairline bg-surface-1 p-5";

  function toggleScope(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }

  async function createToken() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/integrations/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), scopes: selected }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      const error = String(body.error ?? "unknown");
      setStatus(
        error === "invalid_name"
          ? "Give the token a name (1–80 characters)."
          : error === "invalid_scopes"
            ? "Pick at least one valid scope."
            : `Couldn't create the token (${error.replace(/_/g, " ")}).`,
      );
      return;
    }
    setMinted({
      token: String(body.token ?? ""),
      name: String(
        (body.created as { name?: string } | undefined)?.name ?? name.trim(),
      ),
    });
    setName("");
    setSelected([scopes[0]?.id].filter(Boolean));
    const created = body.created as Omit<
      TokenRow,
      "createdAt" | "lastUsedAt" | "revokedAt"
    > & { createdAt: string };
    setTokens((t) => [...t, { ...created, lastUsedAt: null, revokedAt: null }]);
    router.refresh();
  }

  async function revoke(id: string) {
    const token = tokens.find((t) => t.id === id);
    if (!token) return;
    const okToProceed = await confirm({
      title: `Revoke ${token.name}?`,
      body: "Anything authenticating with this token (e.g. the Lightroom publish plugin) stops working immediately. This can't be undone.",
      confirmLabel: "Revoke token",
    });
    if (!okToProceed) return;
    setBusy(true);
    const res = await fetch(`/api/studio/integrations/tokens/${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setStatus("Couldn't revoke the token — try again.");
      return;
    }
    setStatus(`Revoked ${token.name}.`);
    setTokens((t) =>
      t.map((x) =>
        x.id === id ? { ...x, revokedAt: new Date().toISOString() } : x,
      ),
    );
    router.refresh();
  }

  async function copyToken() {
    if (!minted) return;
    await navigator.clipboard.writeText(minted.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Snap Publish setup card (WEBC-124, audit F5) — the plugin funnel used
       * to dead-end here: mint a token, then go find the plugin somewhere
       * else. The download and the three steps that take a photographer from
       * zero to a first published collection now sit above the token form. */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-ink">
              Lightroom Classic plugin
            </h2>
            <p className="mt-1 text-sm text-ink-subtle">
              Publish photos straight from Lightroom Classic into a Snap
              gallery with the Snap Publish plugin.
            </p>
          </div>
          <Button asChild size="sm">
            <a href="/api/integrations/lightroom-plugin" download>
              <Download className="h-4 w-4" aria-hidden />
              Download plugin
            </a>
          </Button>
        </div>
        <ol className="mt-4 flex flex-col gap-2.5">
          {[
            <>
              Download the plugin and install it in Lightroom Classic under{" "}
              <em>File → Plug-in Manager → Add</em>.
            </>,
            <>
              Create a token below, then paste it — together with your studio
              address — into the plugin&rsquo;s connection settings and click{" "}
              <em>Test Connection</em>.
            </>,
            <>
              In Lightroom&rsquo;s Publish Services panel, set up{" "}
              <em>Snap Publish</em>, create a publish collection named after
              your gallery, drag photos in, and hit <em>Publish</em>.
            </>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 text-[10px] font-semibold text-ink-subtle"
              >
                {i + 1}
              </span>
              <p className="text-[13px] leading-snug text-ink-subtle">
                {step}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-ink-tertiary">
          Full setup guide:{" "}
          <a
            href="/docs/integrations"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            Integrations
          </a>{" "}
          ·{" "}
          <a
            href="/docs/embeds"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            Embeds
          </a>
        </p>
      </section>

      <section className={card}>
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-medium text-ink">
            Integration tokens
          </h2>
          <DocHint slug="integrations" />
        </div>
        <p className="mt-1 text-sm text-ink-subtle">
          Scoped API tokens authenticate integrations like the Lightroom Classic
          publish plugin against{" "}
          <code className="rounded bg-canvas px-1 py-0.5 font-mono text-xs">
            /api/integrations/v1
          </code>
          . Each token carries only the scopes you pick.
        </p>

        {minted && (
          <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              Copy “{minted.name}” now — it's shown only once
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-canvas px-3 py-2 font-mono text-xs text-ink">
                {minted.token}
              </code>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Copy token"
                onClick={() => void copyToken()}
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-tertiary">
              Snap stores only a hash of this token — if you lose it, revoke and
              create a new one.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="token-name" className="sr-only">
                Token name
              </label>
              <Input
                id="token-name"
                placeholder="e.g. Lightroom on my studio desktop"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={busy || !name.trim() || selected.length === 0}
              onClick={() => void createToken()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              Create token
            </Button>
          </div>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
            <legend className="sr-only">Scopes</legend>
            {scopes.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-1.5 text-sm text-ink-subtle"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggleScope(s.id)}
                  className="h-4 w-4 rounded border-hairline"
                />
                {s.label}
              </label>
            ))}
          </fieldset>
        </div>
        {status && <p className="mt-3 text-sm text-ink-subtle">{status}</p>}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Existing tokens</h2>
        {tokens.length === 0 ? (
          <p className="mt-2 text-sm text-ink-subtle">
            No integration tokens yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-hairline">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <KeyRound
                        className="h-3.5 w-3.5 text-ink-tertiary"
                        aria-hidden
                      />
                      {t.name}
                    </span>
                    {t.revokedAt ? (
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-tertiary">
                        Revoked
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-tertiary">
                    <code className="font-mono">{t.prefix}…</code> · created{" "}
                    {fmt(t.createdAt)} · last used {fmt(t.lastUsedAt)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.scopes.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-subtle"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                {!t.revokedAt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void revoke(t.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
