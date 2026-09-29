"use client";

/* Settings → Brand (WEB-234/236): logo, accent, font stack, widget theme and
 * the advanced token JSON with a live preview iframe. The brandRevision prop
 * (profile updatedAt) is appended to the preview src as `&rev=` so a save
 * reloads the iframe — the re-mount trick that moved here from the monolith.
 * WEB-238/239: white-label toggle + browser-side brand asset generation
 * (favicon/email-header/OG/watermark from the one logo). */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { generateAndUploadBrandAssets } from "@/components/brand-asset-generator";
import { WatermarkCard } from "@/components/watermark-card";

export function SettingsBrand({
  embedKey,
  hasLogo,
  logoUrl: initialLogoUrl,
  accentColor: initialAccent,
  fontFamily: initialFont,
  theme: initialTheme,
  tokens: initialTokens,
  brandRevision,
  whiteLabelEntitled,
  removeBranding: initialRemoveBranding,
  hasBrandAssets: initialHasBrandAssets,
  studioName,
  watermark,
  watermarkLogoUrl,
  deterrentsOn: initialDeterrents,
}: {
  embedKey: string;
  hasLogo: boolean;
  logoUrl: string | null;
  accentColor: string;
  fontFamily: string;
  theme: string;
  tokens: string;
  brandRevision: string;
  /** WEB-238: plan grants white-label (Studio/Pro); false renders the upsell. */
  whiteLabelEntitled: boolean;
  removeBranding: boolean;
  /** WEB-239: a generated bundle exists (favicon/OG/etc.). */
  hasBrandAssets: boolean;
  studioName: string;
  /** WEB-242: watermark card state + the generated watermark-source URL. */
  watermark: { mode: "off" | "corner" | "tiled" | "text"; opacity: number; scale: number; margin: number; text: string };
  watermarkLogoUrl: string | null;
  /** WEB-243: gallery protection deterrents enabled. */
  deterrentsOn: boolean;
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
  const [removeBranding, setRemoveBranding] = useState(initialRemoveBranding);
  const [deterrents, setDeterrents] = useState(initialDeterrents);
  const [hasBrandAssets, setHasBrandAssets] = useState(initialHasBrandAssets);
  const [assetsBusy, setAssetsBusy] = useState(false);

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
        ...(whiteLabelEntitled ? { removeBranding } : {}),
        ...(whiteLabelEntitled ? { deterrents: { rightClick: deterrents } } : {}),
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

  /** WEB-239: one logo → favicon + apple-touch + email header + OG card +
   * watermark source, canvas-composited in the browser and posted as a
   * bundle. Runs on demand (button) and automatically after a logo upload. */
  async function generateAssets(freshLogoUrl?: string) {
    const url = freshLogoUrl ?? logoUrl;
    if (!url) {
      setStatus("Upload a logo first — brand assets generate from it.");
      return;
    }
    setAssetsBusy(true);
    setStatus("Generating brand assets…");
    const out = await generateAndUploadBrandAssets({ logoUrl: url, studioName, accent: accentColor });
    setAssetsBusy(false);
    if (out.ok) {
      setHasBrandAssets(true);
      setStatus("Brand assets generated — favicon, share cards and email header updated.");
      router.refresh();
    } else if (out.error === "no_logo") {
      setStatus("Upload a logo first — brand assets generate from it.");
    } else if (out.error === "plan_required") {
      setStatus("Brand assets are part of white-label (Studio & Pro).");
    } else {
      setStatus(`Brand asset generation failed: ${out.error}`);
    }
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    setStatus(null);
    const form = new FormData();
    form.set("logo", file);
    const res = await fetch("/api/studio/logo", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      const fresh = `/api/embed/logo?key=${embedKey}`;
      setLogoUrl(fresh);
      setStatus("Logo uploaded.");
      router.refresh();
      if (whiteLabelEntitled) {
        // Regenerate the derived kit immediately — the browser already has
        // the decoded image warm. Failure here only means the retro-fill
        // button stays available.
        void generateAssets(`${fresh}&r=${Date.now()}`);
      }
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

      {/* WEB-238: white-label toggle (Studio/Pro) — effective only when both
       * the plan grants it and the studio turns it on. Upsell for Free/Lite. */}
      <div className="mt-5 rounded-[12px] border border-hairline bg-surface-1 p-4">
        {whiteLabelEntitled ? (
          <>
            <label htmlFor="removeBranding" className="flex cursor-pointer items-start gap-3">
              <input
                id="removeBranding"
                type="checkbox"
                checked={removeBranding}
                onChange={(e) => setRemoveBranding(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium text-ink">Remove Snap branding</span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-subtle">
                  Your clients stop seeing Snap everywhere: gallery and booking footers, email headers and footers,
                  browser tab titles, invoice and contract PDFs. Emails still arrive from a snap.webcules.com address
                  (signed domain) but show your studio name. Save to apply.
                </span>
              </span>
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Brand assets</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
                  {hasBrandAssets
                    ? "Favicon, browser share cards, email header and watermark source generated from your logo."
                    : "Generate your favicon, browser share cards, email header and watermark source from your logo — one click, no design work."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void generateAssets()}
                disabled={assetsBusy || !hasLogo}
              >
                {assetsBusy ? "Generating…" : hasBrandAssets ? "Regenerate" : "Generate brand assets"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">Remove Snap branding</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
              Make the platform invisible to your clients — galleries, emails, invoices and tab titles carry only your
              studio. Included on the Studio and Pro plans.
            </p>
            <a href="/dashboard/settings/billing" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Upgrade to Studio →
            </a>
          </>
        )}
      </div>

      {/* WEB-243: gallery protection deterrents — honest scope copy is the
       * product requirement, not legal fine print. */}
      <div className="mt-5 rounded-[12px] border border-hairline bg-surface-1 p-4">
        {whiteLabelEntitled ? (
          <label htmlFor="deterrents" className="flex cursor-pointer items-start gap-3">
            <input
              id="deterrents"
              type="checkbox"
              checked={deterrents}
              onChange={(e) => setDeterrents(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Gallery protection</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-subtle">
                Disables right-click, drag-to-desktop and long-press save menus on gallery photos. Deters casual saving.
                Like every platform, it cannot prevent screenshots — we won't pretend it can. Save to apply.
              </span>
            </span>
          </label>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">Gallery protection</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
              Right-click, drag and long-press deterrence on client galleries. Included on the Studio and Pro plans.
            </p>
            <a href="/dashboard/settings/billing" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Upgrade to Studio →
            </a>
          </>
        )}
      </div>

      <WatermarkCard initial={watermark} studioName={studioName} logoUrl={watermarkLogoUrl} entitled={whiteLabelEntitled} />
    </section>
  );
}
