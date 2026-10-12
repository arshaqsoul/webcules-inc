"use client";

/* /dashboard/store/[id] (WEB-179, Commerce C1 2/7) — the price list editor:
 * products and variants with create / rename / archive / reorder, live
 * markup % (derived client-side from cost+price with the same
 * @webcules/commerce function the server uses), and the bulk markup tool
 * (select variants → % + rounding preset → preview → apply). */
import { useState } from "react";

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Loader2, Plus } from "lucide-react";
import { markupPct } from "@webcules/commerce";
import type { MarkupRounding } from "@webcules/commerce";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import type { Gates, PriceListRow } from "@/components/store-home";

type VariantRow = {
  id: string;
  name: string;
  costCents: number;
  priceCents: number;
  markupPct: number | null;
  active: boolean;
  position: number;
};

type ProductRow = {
  id: string;
  kind: string;
  name: string;
  active: boolean;
  position: number;
  variants: VariantRow[];
};

export type PriceListDetailData = PriceListRow & { products: ProductRow[] };

const KIND_LABELS: Record<string, string> = { digital: "Digital", print: "Print", package: "Package", custom: "Custom" };
const ROUNDING_OPTIONS: Array<{ id: MarkupRounding; label: string }> = [
  { id: "none", label: "Exact (no rounding)" },
  { id: "dollar", label: "Nearest whole unit" },
  { id: "charm99", label: "Charm — ends .99" },
  { id: "charm95", label: "Charm — ends .95" },
];

const fmt = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

const toCents = (input: string) => Math.round(Number(input || 0) * 100);

const fmtPct = (pct: number | null) => (pct === null ? "n/a" : `${pct.toFixed(pct % 1 === 0 ? 0 : 2)}%`);

async function api(path: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function move<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const j = idx + dir;
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

export function CommercePriceListEditor({ initial, gates }: { initial: PriceListDetailData; gates: Gates }) {
  const [detail, setDetail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function reload() {
    const res = await fetch(`/api/studio/commerce/${detail.id}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
  }

  async function run(fn: () => Promise<{ ok: boolean; data: Record<string, unknown> }>, failMsg: string): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(failMsg);
      return null;
    }
    await reload();
    return res.data;
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <a href="/dashboard/store" className="text-xs text-ink-tertiary hover:underline">← All price lists</a>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.6px] text-ink">{detail.name}</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          {detail.currency} · {detail.productCount} product{detail.productCount === 1 ? "" : "s"}
          {detail.isDefault && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Default</span>}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <BulkMarkupTool
        currency={detail.currency}
        variantCount={detail.products.reduce((n, p) => n + p.variants.length, 0)}
        selectedCount={selected.size}
        selectedIds={[...selected]}
        onCleared={() => setSelected(new Set())}
        run={run}
      />

      <div className="flex flex-col gap-4">
        {detail.products.map((p, idx) => (
          <ProductCard
            key={p.id}
            product={p}
            currency={detail.currency}
            gates={gates}
            first={idx === 0}
            last={idx === detail.products.length - 1}
            busy={busy}
            selected={selected}
            onToggleSelect={toggleSelected}
            onReorder={(dir) =>
              run(
                () =>
                  api(`/api/studio/commerce/${detail.id}/products`, "PUT", {
                    productIds: move(detail.products.map((x) => x.id), idx, dir),
                  }),
                "Reorder failed.",
              )
            }
            onPatchProduct={(body, failMsg) => run(() => api(`/api/studio/commerce/products/${p.id}`, "PATCH", body), failMsg)}
            onAddVariant={(body, failMsg) =>
              run(() => api(`/api/studio/commerce/products/${p.id}/variants`, "POST", body), failMsg)
            }
            onPatchVariant={(variantId, body, failMsg) =>
              run(() => api(`/api/studio/commerce/variants/${variantId}`, "PATCH", body), failMsg)
            }
            onReorderVariants={(variantIds, failMsg) =>
              run(() => api(`/api/studio/commerce/products/${p.id}/variants`, "PUT", { variantIds }), failMsg)
            }
          />
        ))}
        {detail.products.length === 0 && (
          <p className="rounded-lg border border-dashed border-hairline px-4 py-10 text-center text-sm text-ink-subtle">
            No products yet — add your first below.
          </p>
        )}
      </div>

      <AddProduct
        gates={gates}
        onAdd={(body) => run(() => api(`/api/studio/commerce/${detail.id}/products`, "POST", body), "Could not add the product.")}
      />
    </div>
  );
}

/** One product: header (rename, archive, reorder) + its variants table. */
function ProductCard({
  product,
  currency,
  gates,
  first,
  last,
  busy,
  selected,
  onToggleSelect,
  onReorder,
  onPatchProduct,
  onAddVariant,
  onPatchVariant,
  onReorderVariants,
}: {
  product: ProductRow;
  currency: string;
  gates: Gates;
  first: boolean;
  last: boolean;
  busy: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onReorder: (dir: -1 | 1) => void;
  onPatchProduct: (body: Record<string, unknown>, failMsg: string) => Promise<Record<string, unknown> | null>;
  onAddVariant: (body: { name: string; costCents: number; priceCents: number }, failMsg: string) => Promise<Record<string, unknown> | null>;
  onPatchVariant: (variantId: string, body: Record<string, unknown>, failMsg: string) => Promise<Record<string, unknown> | null>;
  onReorderVariants: (variantIds: string[], failMsg: string) => Promise<Record<string, unknown> | null>;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newVariant, setNewVariant] = useState<{ name: string; cost: string; price: string } | null>(null);

  return (
    <section className={`rounded-lg border border-hairline bg-surface ${product.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-tertiary">{KIND_LABELS[product.kind] ?? product.kind}</span>
        {renaming === null ? (
          <button className="font-medium text-ink hover:underline" onClick={() => setRenaming(product.name)}>{product.name}</button>
        ) : (
          <span className="flex items-center gap-2">
            <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} className="w-56" />
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (await onPatchProduct({ name: renaming }, "Rename failed.")) setRenaming(null);
              }}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
          </span>
        )}
        <span className="flex-1" />
        <Button size="icon" variant="ghost" title="Move up" disabled={first || busy} onClick={() => onReorder(-1)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" title="Move down" disabled={last || busy} onClick={() => onReorder(1)}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onPatchProduct({ active: !product.active }, product.active ? "Archive failed." : "Restore failed.")}
        >
          {product.active ? <Archive className="mr-1 h-3 w-3" /> : <ArchiveRestore className="mr-1 h-3 w-3" />}
          {product.active ? "Archive" : "Restore"}
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-tertiary">
            <th className="w-8 px-4 py-2" />
            <th className="px-2 py-2 font-normal">Variant</th>
            <th className="px-2 py-2 font-normal">Your cost</th>
            <th className="px-2 py-2 font-normal">Price</th>
            <th className="px-2 py-2 font-normal">Markup</th>
            <th className="px-2 py-2 font-normal">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {product.variants.map((v, vi) => (
            <VariantRow
              key={v.id}
              variant={v}
              currency={currency}
              busy={busy}
              checked={selected.has(v.id)}
              onToggleSelect={() => onToggleSelect(v.id)}
              first={vi === 0}
              last={vi === product.variants.length - 1}
              onPatch={(body, failMsg) => onPatchVariant(v.id, body, failMsg)}
              onReorder={(dir) => onReorderVariants(move(product.variants.map((x) => x.id), vi, dir), "Reorder failed.")}
            />
          ))}
        </tbody>
      </table>

      <div className="border-t border-hairline px-4 py-3">
        {newVariant === null ? (
          <Button size="sm" variant="ghost" onClick={() => setNewVariant({ name: "", cost: "", price: "" })}>
            <Plus className="mr-1 h-3 w-3" /> Add variant
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={newVariant.name} onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })} placeholder="Variant name" className="w-40" />
            <Input value={newVariant.cost} onChange={(e) => setNewVariant({ ...newVariant, cost: e.target.value })} placeholder="Cost $" inputMode="decimal" className="w-24" />
            <Input value={newVariant.price} onChange={(e) => setNewVariant({ ...newVariant, price: e.target.value })} placeholder="Price $" inputMode="decimal" className="w-24" />
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                const saved = await onAddVariant(
                  { name: newVariant.name, costCents: toCents(newVariant.cost), priceCents: toCents(newVariant.price) },
                  "Could not add the variant — check cost/price.",
                );
                if (saved) setNewVariant(null);
              }}
            >
              Save variant
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewVariant(null)}>Cancel</Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** One variant row: inline edit of name/cost/price with live markup, archive
 * toggle, reorder, and the bulk-markup selection checkbox. */
function VariantRow({
  variant,
  currency,
  busy,
  checked,
  onToggleSelect,
  first,
  last,
  onPatch,
  onReorder,
}: {
  variant: VariantRow;
  currency: string;
  busy: boolean;
  checked: boolean;
  onToggleSelect: () => void;
  first: boolean;
  last: boolean;
  onPatch: (body: Record<string, unknown>, failMsg: string) => Promise<Record<string, unknown> | null>;
  onReorder: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(variant.name);
  const [cost, setCost] = useState((variant.costCents / 100).toFixed(2));
  const [price, setPrice] = useState((variant.priceCents / 100).toFixed(2));

  const liveMarkup = editing ? markupPct(toCents(cost), toCents(price)) : variant.markupPct;

  return (
    <tr className={`border-t border-hairline ${variant.active ? "" : "opacity-60"}`}>
      <td className="px-4 py-2">
        <input type="checkbox" checked={checked} onChange={onToggleSelect} aria-label={`Select ${variant.name}`} className="h-4 w-4" />
      </td>
      <td className="px-2 py-2">
        {editing ? <Input value={name} onChange={(e) => setName(e.target.value)} className="w-36" /> : variant.name}
      </td>
      <td className="px-2 py-2">
        {editing ? (
          <Input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="w-24" />
        ) : variant.costCents === 0 ? (
          <span className="text-ink-tertiary">—</span>
        ) : (
          fmt(variant.costCents, currency)
        )}
      </td>
      <td className="px-2 py-2">
        {editing ? <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-24" /> : fmt(variant.priceCents, currency)}
      </td>
      <td className="px-2 py-2 text-ink-subtle">{fmtPct(liveMarkup)}</td>
      <td className="px-2 py-2">
        <button className="text-xs text-ink-tertiary hover:text-ink" disabled={busy} onClick={() => onPatch({ active: !variant.active }, "Status change failed.")}>
          {variant.active ? "Active" : "Archived"}
        </button>
      </td>
      <td className="px-4 py-2">
        <span className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Move up" disabled={first || busy} onClick={() => onReorder(-1)}>
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Move down" disabled={last || busy} onClick={() => onReorder(1)}>
            <ArrowDown className="h-3 w-3" />
          </Button>
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const saved = await onPatch(
                    { name, costCents: toCents(cost), priceCents: toCents(price) },
                    "Save failed — cost and price must be valid amounts.",
                  );
                  if (saved) setEditing(false);
                }}
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          )}
        </span>
      </td>
    </tr>
  );
}

/** The bulk markup tool: pick variants (checkboxes in the tables), enter a %
 * and a rounding preset, preview every resulting price, then apply. */
function BulkMarkupTool({
  currency,
  variantCount,
  selectedCount,
  selectedIds,
  onCleared,
  run,
}: {
  currency: string;
  variantCount: number;
  selectedCount: number;
  selectedIds: string[];
  onCleared: () => void;
  run: (fn: () => Promise<{ ok: boolean; data: Record<string, unknown> }>, failMsg: string) => Promise<Record<string, unknown> | null>;
}) {
  const [pct, setPct] = useState("100");
  const [rounding, setRounding] = useState<MarkupRounding>("none");
  const [preview, setPreview] = useState<Array<{ id: string; name: string; priceCents: number; newPriceCents: number | null }> | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    setBusy(true);
    setPreview(null);
    setResult(null);
    const res = await api("/api/studio/commerce/bulk-markup", "POST", {
      variantIds: selectedIds,
      markupPct: Number(pct),
      rounding,
      preview: true,
    });
    setBusy(false);
    if (res.ok && Array.isArray(res.data.variants)) {
      setPreview(res.data.variants as Array<{ id: string; name: string; priceCents: number; newPriceCents: number | null }>);
    }
  }

  return (
    <section className="rounded-lg border border-hairline bg-surface px-4 py-4">
      <h2 className="text-sm font-semibold text-ink">Bulk markup</h2>
      <p className="mt-0.5 text-xs text-ink-tertiary">
        Select variants in the list below, then apply a markup to your cost — new price = cost × (1 + markup %), rounded to your preset. Zero-cost variants are skipped.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-subtle">{selectedCount} of {variantCount} selected</span>
        <Input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className="w-20" aria-label="Markup percent" />
        <span className="text-sm text-ink-subtle">%</span>
        <select
          value={rounding}
          onChange={(e) => setRounding(e.target.value as MarkupRounding)}
          className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
          aria-label="Rounding preset"
        >
          {ROUNDING_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={selectedCount === 0 || busy} onClick={loadPreview}>
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Preview
        </Button>
        {preview && (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const data = await run(
                () => api("/api/studio/commerce/bulk-markup", "POST", { variantIds: selectedIds, markupPct: Number(pct), rounding }),
                "Bulk markup failed.",
              );
              if (data) {
                setResult(`Updated ${data.updated} variant${data.updated === 1 ? "" : "s"}${Number(data.skipped) > 0 ? `, skipped ${data.skipped} (no cost)` : ""}.`);
                setPreview(null);
                onCleared();
              }
            }}
          >
            Apply to {selectedCount}
          </Button>
        )}
      </div>

      {result && <p className="mt-2 text-sm text-success">{result}</p>}

      {preview && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-tertiary">
              <th className="py-1 font-normal">Variant</th>
              <th className="py-1 font-normal">Now</th>
              <th className="py-1 font-normal">Becomes</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((v) => (
              <tr key={v.id} className="border-t border-hairline">
                <td className="py-1.5">
                  {v.name}
                  {v.newPriceCents === null && <span className="ml-2 text-xs text-ink-tertiary">skipped (no cost)</span>}
                </td>
                <td className="py-1.5 text-ink-tertiary">{fmt(v.priceCents, currency)}</td>
                <td className="py-1.5 font-medium">{v.newPriceCents === null ? "—" : fmt(v.newPriceCents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Add-product form at the bottom of the editor (kind plan-gated). */
function AddProduct({ gates, onAdd }: { gates: Gates; onAdd: (body: { kind: string; name: string }) => Promise<Record<string, unknown> | null> }) {
  const [kind, setKind] = useState("digital");
  const [name, setName] = useState("");

  const kindOptions = [
    { id: "digital", label: "Digital", allowed: true },
    { id: "print", label: "Print", allowed: true },
    { id: "package", label: "Package", allowed: gates.packagesAllowed },
    { id: "custom", label: "Custom", allowed: gates.customProductsAllowed },
  ].filter((k) => k.allowed);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-hairline px-4 py-3">
      <select value={kind} onChange={(e) => setKind(e.target.value)} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink" aria-label="Product kind">
        {kindOptions.map((k) => (
          <option key={k.id} value={k.id}>{k.label}</option>
        ))}
      </select>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New product name" className="w-56" />
      <Button
        size="sm"
        disabled={!name.trim()}
        onClick={async () => {
          if (await onAdd({ kind, name })) setName("");
        }}
      >
        <Plus className="mr-1 h-3 w-3" /> Add product
      </Button>
      {!gates.packagesAllowed && <span className="text-xs text-ink-tertiary">Packages and custom products unlock on Studio.</span>}
    </div>
  );
}
