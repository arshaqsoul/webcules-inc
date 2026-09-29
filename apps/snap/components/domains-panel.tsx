"use client";

/* Settings → Domains (WEB-224/229): add / verify / status / remove flow
 * with copyable DNS records and tier-aware upsells. Self-contained section
 * component fed by its route page; talks to /api/studio/domains. The panel
 * always operates on the ACTIVE studio (header names it) so a multi-studio
 * Pro user can't configure the wrong brand. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Check, Copy, ExternalLink, Globe, Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { useConfirm } from "@/components/confirm-provider";
import { normalizeHostname } from "@/lib/domains";

type DomainRow = {
  id: string;
  hostname: string;
  isPrimary: boolean;
  status: string;
  verificationToken: string;
  certStatus: string | null;
  dcvTxtName: string | null;
  dcvTxtValue: string | null;
  lastError: string | null;
  lastCheckedAt: number | null;
};

type PanelData = {
  domains: DomainRow[];
  cnameTarget: string;
  maxCustomDomains: number;
  activeCustomDomains: number;
  plan: string;
  addonCustomDomain: boolean;
  hasSubscription: boolean;
};

const PENDING_STATUSES = new Set(["pending_verification", "verified", "cert_pending"]);

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_verification: { label: "Pending verification", cls: "bg-canvas text-ink-subtle" },
  verified: { label: "Verified — certificate next", cls: "bg-canvas text-ink-subtle" },
  cert_pending: { label: "Certificate issuing", cls: "bg-info/10 text-info" },
  active: { label: "Active", cls: "bg-success/10 text-success" },
  degraded: { label: "Action needed", cls: "bg-warning/10 text-warning" },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
  suspended_entitlement: { label: "Suspended — plan change", cls: "bg-warning/10 text-warning" },
  removed: { label: "Removed", cls: "bg-canvas text-ink-tertiary" },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, cls: "bg-canvas text-ink-subtle" };
}

export function DomainsPanel({
  initial,
  studioName,
  slug,
}: {
  initial: PanelData;
  studioName: string;
  slug: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStart = useRef(0);

  const preview = input.trim() ? normalizeHostname(input) : null;

  async function refresh() {
    const res = await fetch("/api/studio/domains");
    if (res.ok) setData((await res.json()) as PanelData);
  }

  // auto-poll while anything is pending — stop after 10 minutes
  useEffect(() => {
    const hasPending = data.domains.some((d) => PENDING_STATUSES.has(d.status));
    if (hasPending && !pollRef.current) {
      pollStart.current = Date.now();
      pollRef.current = setInterval(() => {
        if (Date.now() - pollStart.current > 10 * 60 * 1000) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          return;
        }
        void refresh();
      }, 10_000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data.domains]);

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function addDomain() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: input.trim() }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      setInput("");
      setStatus(
        typeof body.cfWarning === "string" && body.cfWarning
          ? body.cfWarning
          : "Domain added — publish the DNS records below, then press Check status.",
      );
      await refresh();
      router.refresh();
    } else {
      const error = String(body.error ?? "unknown");
      if (error === "hostname_taken") setStatus("That domain isn't available.");
      else if (error === "entitlement_limit") setStatus("Your plan's domain slots are full — remove one or upgrade.");
      else if (error === "apex_not_supported") setStatus(String(body.reason ?? "Point a subdomain like gallery.yourstudio.com — apex domains can't CNAME."));
      else if (error === "cf_rejected") setStatus(String(body.reason ?? "Cloudflare rejected the hostname."));
      else setStatus(String(body.reason ?? `Couldn't add the domain (${error.replace(/_/g, " ")}).`));
    }
  }

  async function action(id: string, act: "verify" | "retry" | "set_primary" | "remove") {
    if (act === "remove") {
      const domain = data.domains.find((d) => d.id === id);
      const okToProceed = await confirm({
        title: `Remove ${domain?.hostname ?? "this domain"}?`,
        body: "Client links on this domain stop working. Existing emails keep working on the standard snap.webcules.com link, and links you already sent stay valid there. You can re-add the domain later.",
        confirmLabel: "Remove domain",
      });
      if (!okToProceed) return;
    }
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/studio/domains/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      if (act === "verify" || act === "retry") {
        setStatus(
          body.status === "active"
            ? `Active! One last thing (founder ops): the Turnstile widget's allowed-hostnames list needs this hostname added in the Cloudflare dashboard before booking forms pass on it.`
            : typeof body.cfWarning === "string" && body.cfWarning
              ? body.cfWarning
              : body.status === "verified"
                ? "Ownership verified — waiting on certificate issuance."
                : "Checked.",
        );
      } else {
        setStatus(null);
      }
      await refresh();
      router.refresh();
    } else {
      setStatus(String(body.reason ?? `Action failed (${String(body.error ?? "unknown")}).`));
    }
  }

  const card = "rounded-[12px] border border-hairline bg-surface-1 p-5";
  const locked = data.maxCustomDomains === 0;

  if (locked) {
    const studioAddOn = data.plan === "studio";
    return (
      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Custom domains</h2>
        <p className="mt-2 text-sm text-ink-subtle">
          Put your galleries, booking page, and client portal on your own domain — <span className="font-medium text-ink">gallery.{slug ? `${slug}.` : ""}yourstudio.com</span> instead of snap.webcules.com.
        </p>
        <div className="mt-4 rounded-lg border border-hairline bg-canvas p-4 text-sm">
          {studioAddOn ? (
            <>
              <p className="text-ink">Add a custom domain to Studio for <span className="font-medium">$5/mo</span>.</p>
              <p className="mt-1 text-xs text-ink-tertiary">One domain, your branding on every client link. Billed on your existing subscription — cancel anytime.</p>
            </>
          ) : (
            <>
              <p className="text-ink">Included with <span className="font-medium">Pro</span> — two custom domains, white-label galleries, 2TB storage.</p>
              <p className="mt-1 text-xs text-ink-tertiary">Free and Lite plans use the standard snap.webcules.com links.</p>
            </>
          )}
        </div>
        <div className="mt-4">
          {studioAddOn && data.hasSubscription ? (
            <Button size="sm" disabled={busy} onClick={() => void buyAddon()}>
              Add a custom domain for $5/mo
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard/settings/billing")}>
              {studioAddOn ? "Get the domain add-on" : "Upgrade to Pro"}
            </Button>
          )}
        </div>
        {status && <p className="mt-3 text-sm text-ink-subtle">{status}</p>}
      </section>
    );
  }

  async function buyAddon() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/plan/addon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enable: true }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setStatus(String(body.message ?? (res.ok ? "Add-on added." : "Couldn't complete — try again.")));
    if (res.ok) {
      await refresh();
      router.refresh();
    }
  }

  const recordBlock = (d: DomainRow) => (
    <div className="mt-3 flex flex-col gap-2">
      {[
        { id: "cname", label: "CNAME", name: d.hostname, value: data.cnameTarget, hint: "If your provider asks for just the record name, enter the part before your domain." },
        { id: "txt", label: "TXT", name: `_snap-verify.${d.hostname}`, value: `"${d.verificationToken}"`, hint: "Proves the domain is yours." },
        ...(d.dcvTxtName && d.dcvTxtValue
          ? [{ id: "dcv", label: "TXT", name: d.dcvTxtName, value: `"${d.dcvTxtValue}"`, hint: "Cloudflare certificate validation record." }]
          : []),
      ].map((r) => (
        <div key={r.id} className="flex items-start gap-2">
          <div className="flex-1 overflow-x-auto rounded-md bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-muted">
            <span className="font-medium text-ink-subtle">{r.label}</span>{" "}
            <span className="text-ink">{r.name}</span> → {r.value}
            <span className="mt-1 block text-ink-tertiary">{r.hint}</span>
          </div>
          <Button variant="secondary" size="icon" aria-label={`Copy ${r.label} record`} onClick={() => void copy(r.id, `${r.label} ${r.name} ${r.value}`)}>
            {copied === r.id ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      ))}
      <p className="text-xs text-ink-tertiary">
        DNS changes usually take minutes, but can take up to 24–48 hours. Full walkthrough: <a className="text-primary hover:underline" href="/docs/domains" target="_blank" rel="noreferrer">the domains guide</a>.
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-medium text-ink">Custom domains</h2>
          <span className="text-xs text-ink-tertiary">Studio: {studioName}</span>
        </div>
        <p className="mt-1 text-xs text-ink-subtle">
          {data.activeCustomDomains} of {data.maxCustomDomains} {data.maxCustomDomains === 1 ? "domain" : "domains"} in use
          {data.addonCustomDomain && data.plan === "studio" ? " · add-on active" : ""}.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="hostname" className="sr-only">Hostname</label>
            <Input
              id="hostname"
              placeholder="gallery.yourstudio.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && preview?.ok && !busy && void addDomain()}
            />
            {input.trim() && (
              <p className={`mt-1.5 text-xs ${preview?.ok ? "text-ink-tertiary" : "text-warning"}`}>
                {preview?.ok
                  ? `Will serve at https://${preview.hostname}`
                  : preview && !preview.ok
                    ? preview.reason ?? friendlyError(preview.error)
                    : null}
              </p>
            )}
          </div>
          <Button onClick={() => void addDomain()} disabled={busy || !preview?.ok} size="sm" className="sm:self-end">
            <Plus className="h-4 w-4" aria-hidden /> Add domain
          </Button>
        </div>
      </section>

      {data.domains.map((d) => {
        const meta = statusMeta(d.status);
        const pending = PENDING_STATUSES.has(d.status);
        return (
          <section key={d.id} className={card} aria-label={`Domain ${d.hostname}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Globe className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
                <span className="truncate font-mono text-sm text-ink">{d.hostname}</span>
                {d.isPrimary && d.status === "active" && (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary"><Star className="h-3 w-3" aria-hidden /> Primary</span>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.cls}`}>
                {meta.label}
                {d.certStatus && pending ? ` · cert: ${d.certStatus}` : ""}
              </span>
            </div>

            {d.lastError && <p className="mt-2 text-xs text-warning">{d.lastError}</p>}

            {pending && recordBlock(d)}

            {d.status === "active" && (
              <p className="mt-2 text-sm text-ink-subtle">
                Your galleries and booking page live at{" "}
                <a href={`https://${d.hostname}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  https://{d.hostname} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {pending && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void action(d.id, "verify")}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Check status
                </Button>
              )}
              {(d.status === "failed" || d.status === "degraded") && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void action(d.id, "retry")}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry verification
                </Button>
              )}
              {d.status === "active" && data.domains.filter((x) => x.status === "active").length > 1 && !d.isPrimary && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void action(d.id, "set_primary")}>
                  <Star className="h-3.5 w-3.5" aria-hidden /> Make primary
                </Button>
              )}
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void action(d.id, "remove")}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
              </Button>
              {busy && <Loader2 className="h-4 w-4 animate-spin text-ink-tertiary" aria-label="Working" />}
            </div>
          </section>
        );
      })}

      {status && <p className="text-sm text-ink-subtle">{status}</p>}
    </div>
  );
}

function friendlyError(error: string): string {
  switch (error) {
    case "apex_not_supported": return "Point a subdomain like gallery.yourstudio.com — apex domains can't CNAME.";
    case "reserved": return "That hostname belongs to Snap — choose one on your own domain.";
    case "port_not_allowed": return "Hostnames can't include a port.";
    case "ip_not_allowed": return "Enter a hostname, not an IP address.";
    case "too_long": return "That hostname is too long.";
    case "invalid_label": return "Hostnames can only use letters, digits and dashes.";
    default: return "That doesn't look like a hostname — try gallery.yourstudio.com.";
  }
}
