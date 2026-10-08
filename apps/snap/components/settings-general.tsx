"use client";

/* Settings → General (WEB-234/236): studio identity + reply routing + inquiry
 * inbox. Same /api/studio/brand PATCH as before — the payload simply carries
 * only this section's fields now (the route falls back to existing values). */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { TAX_LABELS, type BusinessIdentity } from "@/lib/business";
import { EMAIL_DOMAIN } from "@/lib/hosts";

export function SettingsGeneral({
  studioName: initialName,
  slug: initialSlug,
  timezone: initialTz,
  contactEmail: initialEmail,
  business: initialBusiness,
}: {
  studioName: string;
  slug: string;
  timezone: string;
  contactEmail: string;
  business: BusinessIdentity;
}) {
  const router = useRouter();
  const [studioName, setStudioName] = useState(initialName);
  const [biz, setBiz] = useState<BusinessIdentity>(initialBusiness);
  const [taxLabel, setTaxLabel] = useState(initialBusiness.taxId ? initialBusiness.taxId.label : "");
  const [bizStatus, setBizStatus] = useState<string | null>(null);
  const [bizBusy, setBizBusy] = useState(false);
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

  async function saveBusiness() {
    setBizBusy(true);
    setBizStatus(null);
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business: {
          legalName: biz.legalName,
          addressLines: biz.addressLines,
          taxId:
            taxLabel && biz.taxId?.value
              ? { label: taxLabel === "Other" ? (biz.taxId.label || "Tax ID") : taxLabel, value: biz.taxId.value }
              : null,
          phone: biz.phone,
          website: biz.website,
        },
      }),
    });
    setBizBusy(false);
    setBizStatus(res.ok ? "Saved." : "Save failed — check the fields.");
    if (res.ok) router.refresh();
  }

  return (
    <>
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Studio profile</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="studioName">Studio name</Label>
          <Input id="studioName" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="slug">Reply address</Label>
          <div className="flex min-w-0 items-center gap-1 font-mono text-xs text-ink-muted">
            <span>hello+</span>
            <input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="min-w-0 w-full flex-1 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-ink sm:w-40 sm:flex-none"
              minLength={3}
              maxLength={40}
            />
            <span>@{EMAIL_DOMAIN}</span>
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

    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Business details</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
        The legal side of your studio — printed on invoices and contracts, and available as merge fields.
        Everything here is optional; leave it blank and documents look exactly as they do today.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="legalName">Legal name</Label>
          <Input
            id="legalName"
            value={biz.legalName}
            placeholder={initialName}
            onChange={(e) => setBiz((b) => ({ ...b, legalName: e.target.value }))}
          />
          <p className="text-xs text-ink-tertiary">Defaults to your studio name.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bizPhone">Phone</Label>
          <Input
            id="bizPhone"
            value={biz.phone}
            onChange={(e) => setBiz((b) => ({ ...b, phone: e.target.value }))}
          />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Label htmlFor={`addr-${i}`}>Address line {i + 1}{i === 0 ? "" : " (optional)"}</Label>
            <Input
              id={`addr-${i}`}
              value={biz.addressLines[i] ?? ""}
              onChange={(e) =>
                setBiz((b) => {
                  const addressLines = [...b.addressLines];
                  addressLines[i] = e.target.value;
                  return { ...b, addressLines };
                })
              }
            />
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Label htmlFor="bizWebsite">Website</Label>
          <Input
            id="bizWebsite"
            value={biz.website}
            placeholder="studio.com"
            onChange={(e) => setBiz((b) => ({ ...b, website: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="taxLabel">Tax ID label</Label>
          <select
            id="taxLabel"
            value={TAX_LABELS.includes(taxLabel as (typeof TAX_LABELS)[number]) ? taxLabel : taxLabel ? "Other" : ""}
            onChange={(e) => setTaxLabel(e.target.value === "Other" ? "" : e.target.value)}
            className="snap-select rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {TAX_LABELS.map((t) => (
              <option key={t} value={t === "Other" ? "Other" : t}>{t}</option>
            ))}
          </select>
          {taxLabel !== "" && (
            <>
              <Label htmlFor="taxValue" className="mt-2">{taxLabel === "Other" ? "Custom label" : `${taxLabel} number`}</Label>
              {taxLabel === "Other" && (
                <Input
                  id="customTaxLabel"
                  value={biz.taxId?.label ?? ""}
                  placeholder="Business No."
                  onChange={(e) =>
                    setBiz((b) => ({
                      ...b,
                      taxId: { label: e.target.value, value: b.taxId?.value ?? "" },
                    }))
                  }
                />
              )}
              <Input
                id="taxValue"
                value={biz.taxId?.value ?? ""}
                onChange={(e) =>
                  setBiz((b) => ({
                    ...b,
                    taxId: { label: b.taxId?.label || taxLabel, value: e.target.value },
                  }))
                }
              />
            </>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {bizStatus && <p className="text-sm text-ink-subtle">{bizStatus}</p>}
        <Button onClick={saveBusiness} disabled={bizBusy} size="sm">
          {bizBusy ? "Saving…" : "Save business details"}
        </Button>
      </div>
    </section>
    </>
  );
}
