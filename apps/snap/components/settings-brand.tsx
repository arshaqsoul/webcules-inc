"use client";

/* Settings → Brand (WEB-234/236): logo, accent, font stack, widget theme and
 * the advanced token JSON with a live preview iframe. The brandRevision prop
 * (profile updatedAt) is appended to the preview src as `&rev=` so a save
 * reloads the iframe — the re-mount trick that moved here from the monolith.
 * Watermark controls are documented to land in this section later. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

export function SettingsBrand({
  embedKey,
  hasLogo,
  logoUrl: initialLogoUrl,
  accentColor: initialAccent,
  fontFamily: initialFont,
  theme: initialTheme,
  tokens: initialTokens,
  brandRevision,
}: {
  embedKey: string;
  hasLogo: boolean;
  logoUrl: string | null;
  accentColor: string;
  fontFamily: string;
  theme: string;
  tokens: string;
  brandRevision: string;
}) {
  const router = useRouter();
  const [accentColor, setAccentColor] = useState(initialAccent);
  const [fontFamily, setFontFamily] = useState(initialFont);
  const [theme, setTheme] = useState(initialTheme);
  const [tokensJson, setTokensJson] = useState(initialTokens);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accentColor,
        // Send the raw string — empty means "clear" (the server drops an
        // empty/invalid stack from the brand JSON). `|| undefined` here is
        // what made a saved font impossible to remove.
        fontFamily,
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
    setStatus(res.ok ? "Brand saved." : "Save failed — check the fields.");
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

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Brand</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="accentColor">Brand accent</Label>
          <div className="flex items-center gap-2">
            <input id="accentColor" type="color" className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
              value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
            <Input value={accentColor} className="font-mono text-xs"
              onChange={(e) => setAccentColor(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fontFamily">Brand font (optional CSS stack)</Label>
          <Input id="fontFamily" placeholder="Georgia, 'Times New Roman', serif" value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="snapTheme">Widget theme</Label>
          <select id="snapTheme" className="snap-select rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Follow the host site</option>
          </select>
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
              key={brandRevision}
              src={"/embed/contact?key=" + embedKey + "&theme=" + (theme === "auto" ? "light" : theme) + (fontFamily ? "&fontFamily=" + encodeURIComponent(fontFamily) : "") + (brandRevision ? "&rev=" + brandRevision : "")}
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
            {hasLogo ? "Replace logo" : "Upload logo (≤512KB png/jpg/webp/svg)"}
          </Label>
          <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
        </div>
        <Button onClick={save} disabled={busy} size="sm">Save brand</Button>
      </div>
      {status && <p className="mt-2 text-sm text-ink-subtle">{status}</p>}
    </section>
  );
}
