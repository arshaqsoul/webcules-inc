"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

type Initial = {
  slug: string;
  studioName: string;
  timezone: string;
  contactEmail: string;
  accentColor: string;
  embedKey: string;
  embedOrigins: string[];
  hasLogo: boolean;
  logoUrl: string | null;
};

export function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [profile, setProfile] = useState({
    studioName: initial.studioName,
    slug: initial.slug,
    timezone: initial.timezone,
    contactEmail: initial.contactEmail,
    accentColor: initial.accentColor,
  });
  const [origins, setOrigins] = useState(initial.embedOrigins.join("\n"));
  const [embedKey, setEmbedKey] = useState(initial.embedKey);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [zones, setZones] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      setZones(Intl.supportedValuesOf("timeZone"));
    } catch {
      setZones([]);
    }
  }, []);

  async function saveProfile() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studioName: profile.studioName,
        slug: profile.slug,
        timezone: profile.timezone,
        contactEmail: profile.contactEmail || undefined,
        accentColor: profile.accentColor,
      }),
    });
    setBusy(false);
    setStatus(res.ok ? "Profile saved." : "Save failed — check the fields.");
    if (res.ok) router.refresh();
  }

  async function saveOrigins() {
    setBusy(true);
    setStatus(null);
    const list = origins.split("\n").map((l) => l.trim()).filter(Boolean);
    const res = await fetch("/api/studio/embed", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origins: list }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setStatus(
      res.ok
        ? `Origins saved (${((body.origins as string[] | undefined)?.length ?? 0)}). ${list.length === 0 ? "Embeds are open from any site until you add origins." : "Embeds now restricted to these sites."}`
        : `Save failed: ${String(body.error ?? "unknown")}`,
    );
    if (res.ok) router.refresh();
  }

  async function rotateKey() {
    if (!confirm("Rotate the embed key? Widgets using the old key stop working immediately.")) return;
    setBusy(true);
    const res = await fetch("/api/studio/embed", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(false);
    if (res.ok) {
      setEmbedKey(String(body.embedKey ?? ""));
      setLogoUrl(`/api/embed/logo?key=${String(body.embedKey ?? "")}`);
      setStatus("Embed key rotated — update the snippet on your website.");
    } else setStatus("Rotation failed.");
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    setStatus(null);
    const form = new FormData();
    form.set("logo", file);
    const res = await fetch("/api/studio/logo", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      setLogoUrl(`/api/embed/logo?key=${embedKey}`);
      setStatus("Logo uploaded.");
      router.refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setStatus(`Logo upload failed: ${String(body.error ?? "unknown")}`);
    }
  }

  const snippet = `<script src="https://snap.webcules.com/embed/loader.js" data-snap-key="${embedKey}" async></script>`;

  const card = "rounded-[12px] border border-hairline bg-surface-1 p-5";

  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Studio profile</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="studioName">Studio name</Label>
            <Input id="studioName" value={profile.studioName}
              onChange={(e) => setProfile({ ...profile, studioName: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Reply address</Label>
            <div className="flex items-center gap-1 font-mono text-xs text-ink-muted">
              <span>hello+</span>
              <input
                id="slug"
                value={profile.slug}
                onChange={(e) => setProfile({ ...profile, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                className="w-40 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-ink"
                minLength={3}
                maxLength={40}
              />
              <span>@snap.webcules.com</span>
            </div>
            <p className="text-xs text-ink-tertiary">Customer replies thread into Snap via this address.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <select id="timezone" className="input rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}>
              {(zones.length ? zones : [profile.timezone]).map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contactEmail">Inquiry inbox (notifications go here)</Label>
            <Input id="contactEmail" type="email" value={profile.contactEmail}
              onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="accentColor">Brand accent</Label>
            <div className="flex items-center gap-2">
              <input id="accentColor" type="color" className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                value={profile.accentColor} onChange={(e) => setProfile({ ...profile, accentColor: e.target.value })} />
              <Input value={profile.accentColor} className="font-mono text-xs"
                onChange={(e) => setProfile({ ...profile, accentColor: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external dynamic brand asset in settings preview
              <img src={logoUrl} alt="Studio logo" className="max-h-9 max-w-[140px] object-contain" />
            ) : (
              <span className="text-xs text-ink-tertiary">No logo yet</span>
            )}
            <Label htmlFor="logo-upload" className="cursor-pointer text-xs text-primary hover:underline">
              {initial.hasLogo ? "Replace logo" : "Upload logo (≤512KB png/jpg/webp/svg)"}
            </Label>
            <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </div>
          <Button onClick={saveProfile} disabled={busy} size="sm">Save profile</Button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Embed widget</h2>
        <p className="mt-1 text-xs text-ink-subtle">
          Paste this where the contact form should appear on your website.
        </p>
        <div className="mt-3 flex items-start gap-2">
          <code className="flex-1 overflow-x-auto whitespace-pre rounded-md bg-canvas px-3 py-2 font-mono text-xs text-ink-muted">
            {snippet}
          </code>
          <Button variant="secondary" size="icon" aria-label="Copy snippet"
            onClick={async () => { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <code className="rounded bg-canvas px-2 py-1 font-mono text-[11px] text-ink-tertiary">{embedKey}</code>
          <Button variant="ghost" size="sm" onClick={rotateKey} disabled={busy} className="text-ink-subtle">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Rotate key
          </Button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Allowed embed sites</h2>
        <p className="mt-1 text-xs text-ink-subtle">
          One origin per line (e.g. https://yourstudio.com). Empty = widgets embed from any site —
          add your website to lock them to it.
        </p>
        <textarea
          className="mt-3 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-ink"
          value={origins}
          placeholder={"https://yourstudio.com\nhttps://www.yourstudio.com"}
          onChange={(e) => setOrigins(e.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={saveOrigins} disabled={busy} size="sm">Save origins</Button>
        </div>
      </section>

      {status && <p className="text-sm text-ink-subtle">{status}</p>}
    </div>
  );
}
