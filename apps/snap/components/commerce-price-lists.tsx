"use client";

/* /dashboard/store (WEB-179, Commerce C1 2/7) — the studio's price lists and
 * the new-list wizard. Fed by the route page (server-rendered initial data);
 * every mutation goes through /api/studio/commerce so plan gates and tenant
 * scoping always run server-side. */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { ArrowRight, Loader2, Pencil, Plus, Star } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";

export type Gates = {
  storeEnabled: boolean;
  maxPriceLists: number;
  packagesAllowed: boolean;
  customProductsAllowed: boolean;
};

export type PriceListRow = {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  productCount: number;
};

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD"];

type WizardProduct = { kind: string; name: string; variants: Array<{ name: string; cost: string; price: string }> };

const KIND_LABELS: Record<string, string> = {
  digital: "Digital",
  print: "Print",
  package: "Package",
  custom: "Custom",
};

export function CommercePriceLists({ initialLists, gates }: { initialLists: PriceListRow[]; gates: Gates }) {
  const router = useRouter();
  const [lists, setLists] = useState(initialLists);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atCap = gates.maxPriceLists >= 0 && lists.length >= gates.maxPriceLists;

  async function refresh() {
    const res = await fetch("/api/studio/commerce", { cache: "no-store" });
    if (res.ok) setLists(((await res.json()) as { priceLists: PriceListRow[] }).priceLists);
  }

  async function rename() {
    if (!renaming) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/studio/commerce/${renaming.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renaming.name }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Rename failed — names need at least one character.");
      return;
    }
    setRenaming(null);
    await refresh();
  }

  async function makeDefault(id: string) {
    setBusy(true);
    await fetch(`/api/studio/commerce/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setDefault: true }),
    });
    setBusy(false);
    await refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Store</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Studio-wide price lists for your gallery store.
            {gates.maxPriceLists >= 0 ? ` ${gates.maxPriceLists} list${gates.maxPriceLists === 1 ? "" : "s"} on your plan.` : " Unlimited lists on your plan."}
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)} disabled={atCap}>
          <Plus className="mr-1 h-4 w-4" /> New price list
        </Button>
      </div>

      {atCap && (
        <p className="rounded-lg border border-hairline bg-canvas px-4 py-3 text-sm text-ink-subtle">
          You&apos;re using every price list your plan allows. Upgrade in Settings → Billing for more.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="flex flex-col gap-2">
        {lists.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3">
            {renaming?.id === l.id ? (
              <div className="flex flex-1 items-center gap-2">
                <Input value={renaming.name} onChange={(e) => setRenaming({ id: l.id, name: e.target.value })} className="max-w-64" />
                <Button size="sm" onClick={rename} disabled={busy}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
              </div>
            ) : (
              <>
                <a href={`/dashboard/store/${l.id}`} className="flex-1 font-medium text-ink hover:underline">
                  {l.name}
                  {l.isDefault && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Default</span>}
                </a>
                <span className="text-sm text-ink-tertiary">
                  {l.productCount} product{l.productCount === 1 ? "" : "s"} · {l.currency}
                </span>
                <div className="flex items-center gap-1">
                  {!l.isDefault && (
                    <Button size="sm" variant="ghost" title="Make default" onClick={() => makeDefault(l.id)} disabled={busy}>
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" title="Rename" onClick={() => setRenaming({ id: l.id, name: l.name })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <a href={`/dashboard/store/${l.id}`}>
                    <Button size="sm" variant="ghost" title="Open">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </>
            )}
          </li>
        ))}
        {lists.length === 0 && (
          <li className="rounded-lg border border-dashed border-hairline px-4 py-10 text-center text-sm text-ink-subtle">
            No price lists yet — create your first with the wizard.
          </li>
        )}
      </ul>

      {wizardOpen && (
        <PriceListWizard
          gates={gates}
          onClose={() => setWizardOpen(false)}
          onCreated={(id) => router.push(`/dashboard/store/${id}`)}
        />
      )}
    </div>
  );
}

/** Three steps: name the list → add products (with variants) → review and
 * create. Creates the list, then each product, then its variants, and drops
 * the user straight into the list editor. */
function PriceListWizard({ gates, onClose, onCreated }: { gates: Gates; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [products, setProducts] = useState<WizardProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kindOptions = [
    { id: "digital", label: "Digital", allowed: true },
    { id: "print", label: "Print", allowed: true },
    { id: "package", label: "Package", allowed: gates.packagesAllowed },
    { id: "custom", label: "Custom", allowed: gates.customProductsAllowed },
  ].filter((k) => k.allowed);

  function addProduct() {
    setProducts((ps) => [...ps, { kind: kindOptions[0].id, name: "", variants: [{ name: "Standard", cost: "", price: "" }] }]);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const listRes = await fetch("/api/studio/commerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, currency }),
      });
      const list = (await listRes.json()) as { id?: string; error?: string };
      if (!listRes.ok || !list.id) throw new Error(list.error ?? "list_failed");
      for (const p of products) {
        if (!p.name.trim()) continue;
        const prodRes = await fetch(`/api/studio/commerce/${list.id}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: p.kind, name: p.name }),
        });
        const prod = (await prodRes.json()) as { id?: string; error?: string };
        if (!prodRes.ok) throw new Error(prod.error ?? "product_failed");
        for (const v of p.variants) {
          if (!v.name.trim()) continue;
          const vRes = await fetch(`/api/studio/commerce/products/${prod.id}/variants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: v.name,
              costCents: Math.round(Number(v.cost || 0) * 100),
              priceCents: Math.round(Number(v.price || 0) * 100),
            }),
          });
          if (!vRes.ok) throw new Error(((await vRes.json()) as { error?: string }).error ?? "variant_failed");
        }
      }
      onCreated(list.id);
    } catch (e) {
      setError(`Creation failed (${e instanceof Error ? e.message : "unknown"}). You can finish setup in the list editor.`);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="border-b border-hairline px-5 py-4">
          <h2 className="font-semibold text-ink">New price list</h2>
          <p className="text-xs text-ink-tertiary">Step {step} of 3 — {step === 1 ? "name it" : step === 2 ? "add products" : "review"}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <label className="text-sm text-ink-subtle">
                Name
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weddings 2027" className="mt-1" />
              </label>
              <label className="text-sm text-ink-subtle">
                Currency (locked once created)
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="snap-select mt-1 w-full rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink">
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {products.map((p, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-hairline p-3">
                  <div className="flex gap-2">
                    <select
                      value={p.kind}
                      onChange={(e) => setProducts((ps) => ps.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
                      className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink"
                    >
                      {kindOptions.map((k) => (
                        <option key={k.id} value={k.id}>{k.label}</option>
                      ))}
                    </select>
                    <Input
                      value={p.name}
                      onChange={(e) => setProducts((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="Product name (e.g. 8×10 print)"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setProducts((ps) => ps.filter((_, j) => j !== i))}>Remove</Button>
                  </div>
                  {p.variants.map((v, j) => (
                    <div key={j} className="flex flex-wrap gap-2 pl-2">
                      <Input
                        value={v.name}
                        onChange={(e) => setProducts((ps) => ps.map((x, xi) => (xi === i ? { ...x, variants: x.variants.map((y, yj) => (yj === j ? { ...y, name: e.target.value } : y)) } : x)))}
                        placeholder="Variant (e.g. Lustre)"
                        className="w-32"
                      />
                      <Input
                        value={v.cost}
                        onChange={(e) => setProducts((ps) => ps.map((x, xi) => (xi === i ? { ...x, variants: x.variants.map((y, yj) => (yj === j ? { ...y, cost: e.target.value } : y)) } : x)))}
                        placeholder="Cost $"
                        inputMode="decimal"
                        className="w-24"
                      />
                      <Input
                        value={v.price}
                        onChange={(e) => setProducts((ps) => ps.map((x, xi) => (xi === i ? { ...x, variants: x.variants.map((y, yj) => (yj === j ? { ...y, price: e.target.value } : y)) } : x)))}
                        placeholder="Price $"
                        inputMode="decimal"
                        className="w-24"
                      />
                      {p.variants.length > 1 && (
                        <Button size="sm" variant="ghost" onClick={() => setProducts((ps) => ps.map((x, xi) => (xi === i ? { ...x, variants: x.variants.filter((_, yj) => yj !== j) } : x)))}>×</Button>
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="self-start" onClick={() => setProducts((ps) => ps.map((x, j) => (j === i ? { ...x, variants: [...x.variants, { name: "", cost: "", price: "" }] } : x)))}>
                    <Plus className="mr-1 h-3 w-3" /> Variant
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addProduct}>
                <Plus className="mr-1 h-4 w-4" /> Add product
              </Button>
              <p className="text-xs text-ink-tertiary">Cost is what you pay your lab (0 for digital goods). Your markup % is always shown live in the editor.</p>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3 text-sm text-ink-subtle">
              <p><span className="font-medium text-ink">{name}</span> · {currency}</p>
              {products.filter((p) => p.name.trim()).map((p, i) => (
                <div key={i} className="rounded-lg border border-hairline px-3 py-2">
                  <span className="font-medium text-ink">{KIND_LABELS[p.kind]} · {p.name}</span>
                  <ul className="mt-1 text-xs text-ink-tertiary">
                    {p.variants.filter((v) => v.name.trim()).map((v, j) => (
                      <li key={j}>{v.name} — cost ${v.cost || 0} · price ${v.price || 0}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-ink-tertiary">You can edit everything — including bulk markup — right after creating.</p>
            </div>
          )}
        </div>

        {error && <p className="border-t border-hairline px-5 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
          <Button variant="ghost" onClick={step === 1 ? onClose : () => setStep(step - 1)} disabled={busy}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !name.trim()}>Next</Button>
          ) : (
            <Button onClick={create} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create list
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
