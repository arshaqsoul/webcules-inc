"use client";

/* Settings → General (WEB-234/236): studio identity + reply routing + inquiry
 * inbox. Same /api/studio/brand PATCH as before — the payload simply carries
 * only this section's fields now (the route falls back to existing values). */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

export function SettingsGeneral({
  studioName: initialName,
  slug: initialSlug,
  timezone: initialTz,
  contactEmail: initialEmail,
}: {
  studioName: string;
  slug: string;
  timezone: string;
  contactEmail: string;
}) {
  const router = useRouter();
  const [studioName, setStudioName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [timezone, setTimezone] = useState(initialTz);
  const [contactEmail, setContactEmail] = useState(initialEmail);
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

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studioName,
        slug,
        timezone,
        contactEmail: contactEmail || undefined,
      }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      setStatus("Saved.");
      router.refresh();
    } else if (typeof body.error === "string" && body.error.startsWith("slug_")) {
      setStatus(`Save failed: that reply address is ${body.error.slice(5).replace(/_/g, " ")}.`);
    } else {
      setStatus("Save failed — check the fields.");
    }
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Studio profile</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="studioName">Studio name</Label>
          <Input id="studioName" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="slug">Reply address</Label>
          <div className="flex items-center gap-1 font-mono text-xs text-ink-muted">
            <span>hello+</span>
            <input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
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
          <select id="timezone" className="input snap-select rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {(zones.length ? zones : [timezone]).map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactEmail">Inquiry inbox (notifications go here)</Label>
          <Input id="contactEmail" type="email" value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {status && <p className="text-sm text-ink-subtle">{status}</p>}
        <Button onClick={save} disabled={busy} size="sm">Save general settings</Button>
      </div>
    </section>
  );
}
