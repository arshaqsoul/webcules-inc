"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { EmbedHub } from "@/components/embed-hub";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

type Initial = {
  slug: string;
  studioName: string;
  timezone: string;
  contactEmail: string;
  accentColor: string;
  fontFamily: string;
  theme: string;
  tokens: string;
  embedKey: string;
  embedOrigins: string[];
  hasLogo: boolean;
  logoUrl: string | null;
  /** WEB-118: rejected auto-delete policy — days, 0 = keep forever. */
  rejectedRetentionDays: number;
  /** WEB-117: reject derivatives that still carry EXIF/GPS. */
  exifStripDerived: boolean;
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
  const [fontFamily, setFontFamily] = useState(initial.fontFamily);
  const [theme, setTheme] = useState(initial.theme);
  const [tokensJson, setTokensJson] = useState(initial.tokens);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [origins, setOrigins] = useState(initial.embedOrigins.join("\n"));
  const [embedKey, setEmbedKey] = useState(initial.embedKey);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [retentionDays, setRetentionDays] = useState(String(initial.rejectedRetentionDays));
  const [stripExif, setStripExif] = useState(initial.exifStripDerived);
  const [zones, setZones] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        // Send the raw string — empty means "clear" (the server drops an
        // empty/invalid stack from the brand JSON). `|| undefined` here is
        // what made a saved font impossible to remove.
        fontFamily,
        // WEB-118: rejected auto-delete policy.
        rejectedPolicy: {
          enabled: Number(retentionDays) > 0,
          ...(Number(retentionDays) > 0 ? { retainDays: Number(retentionDays) } : {}),
        },
        // WEB-117: EXIF/GPS strip policy for derivatives.
        exifStripDerived: stripExif,
        theme: theme === "light" || theme === "dark" || theme === "auto" ? theme : undefined,
        tokens: (() => {
          try {
            return tokensJson.trim() ? JSON.parse(tokensJson) : undefined;
          } catch {
            return undefined;
          }
        })(),
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="fontFamily">Brand font (optional CSS stack)</Label>
            <Input id="fontFamily" placeholder="Georgia, 'Times New Roman', serif" value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="snapTheme">Widget theme</Label>
            <select id="snapTheme" className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Follow the host site</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rejectedRetention">Rejected files</Label>
            <select id="rejectedRetention" className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)}>
              <option value="0">Keep forever</option>
              <option value="7">Delete after 7 days</option>
              <option value="14">Delete after 14 days</option>
              <option value="30">Delete after 30 days</option>
              <option value="60">Delete after 60 days</option>
              <option value="90">Delete after 90 days</option>
            </select>
            <p className="text-xs text-ink-tertiary">
              The daily job permanently deletes rejected files past this window. Files in an active client gallery are never auto-deleted.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={stripExif}
                onChange={(e) => setStripExif(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                Strip camera metadata (EXIF/GPS) from thumbnails &amp; previews
                <span className="mt-1 block text-xs font-normal text-ink-tertiary">
                  Thumbnails and previews shown in your dashboard and client galleries are re-encoded in the
                  browser, so they never carry location or camera data — with this on, the server verifies it
                  and rejects any that do. Your original files are stored and downloaded bit-exact, camera
                  metadata included.
                </span>
              </span>
            </label>
          </div>
        </div>
        <button type="button" className="mt-3 text-xs text-ink-subtle underline underline-offset-2" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "Hide" : "Show"} advanced widget tokens (JSON)
        </button>
        {showAdvanced && (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={tokensJson}
              onChange={(e) => setTokensJson(e.target.value)}
              rows={5}
              placeholder='{ "bg": "#fafafa", "radius": "12px" }'
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            />
            <p className="text-[11px] text-ink-tertiary">
              Token keys: accent, bg, surface, text, muted, border, radius, fontFamily. Invalid values are dropped on save.
            </p>
            <div className="overflow-hidden rounded-lg border border-hairline">
              <iframe
                title="Widget preview"
                src={"/embed/contact?key=" + initial.embedKey + "&theme=" + (theme === "auto" ? "light" : theme) + (fontFamily ? "&fontFamily=" + encodeURIComponent(fontFamily) : "")}
                className="h-72 w-full border-0"
              />
            </div>
          </div>
        )}
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

      <EmbedHub
        embedKey={embedKey}
        slug={initial.slug}
        studioTheme={initial.theme}
        studioFontFamily={initial.fontFamily}
        originsCount={initial.embedOrigins.length}
        onKeyRotated={(newKey) => {
          setEmbedKey(newKey);
          setLogoUrl(`/api/embed/logo?key=${newKey}`);
        }}
      />

      <section className={card} id="origins">
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
