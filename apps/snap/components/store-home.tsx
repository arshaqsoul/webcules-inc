"use client";

/* Store home (WEB-277, Commerce C1 6/7) — the dashboard Store section per
 * the board-approved WEB-175 handoff. ALL user-facing copy here is the
 * handoff's final copy; change it only through a design revision.
 *
 * States (handoff state matrix):
 *  - loading / load error live at the route level (loading.tsx, error.tsx);
 *  - first run (0 lists): welcome banner + template picker + Start from
 *    scratch, payouts banner when Stripe isn't connected, first-run status;
 *  - populated: status card (optimistic switch, reverts to server truth on
 *    failure) + Price lists / Products tabs;
 *  - preview: preparing → opens /dashboard/store/preview beside the
 *    dashboard; error card with Try again.
 *
 * WEBC-121 (audit F2+F9): the first-run picker became the Store setup
 * wizard — create a price list with a product → open the store → attach
 * the list to a gallery → test-buy preview — and stays up (dismissable)
 * until the store is actually sellable. The Setup Guide's "Set up your
 * store" step deep-links here with ?setup=1, which scrolls to and
 * highlights the wizard. The plan-cap notice is an inline upgrade CTA
 * naming what the next tier unlocks, not passive text.
 *
 * Mutations go through /api/studio/commerce + /api/studio/store-status +
 * /api/studio/store-preview so plan gates and tenant scoping always run
 * server-side. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AlertTriangle, ArrowRight, Check, ExternalLink, Loader2, Pencil, Plus, Star } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@webcules/ui/components/tabs";

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

export type ProductRow = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  priceListId: string;
  priceListName: string;
  priceListCurrency: string;
  variantCount: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
};

export type GalleryOption = { id: string; projectTitle: string };

export type StoreAttachmentRow = {
  grantId: string;
  priceListId: string;
  priceListName: string;
  projectTitle: string;
};

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD"];

type WizardProduct = { kind: string; name: string; variants: Array<{ name: string; cost: string; price: string }> };

const KIND_LABELS: Record<string, string> = {
  digital: "Digital",
  print: "Print",
  package: "Package",
  custom: "Custom",
};

/** What the NEXT tier unlocks, shown inline on the plan-cap notice
 * (WEBC-121 F2: the upgrade path must not be a 3-hop text pointer). */
const NEXT_TIER_UNLOCKS: Record<string, string> = {
  lite: "Studio unlocks 5 price lists, packages, and custom products.",
  studio: "Pro unlocks unlimited price lists.",
};

/** The three first-run templates (WEB-175 handoff copy). The ids match
 * STORE_TEMPLATES in lib/commerce.ts — names/blurbs must stay in sync. */
const TEMPLATE_CARDS = [
  { id: "portrait", name: "Portrait session", blurb: "Digitals, prints, wall art · USD" },
  { id: "wedding", name: "Wedding", blurb: "Packages, albums, digitals · USD" },
  { id: "event", name: "Event & corporate", blurb: "Digitals, packages, custom · USD" },
] as const;

function fmtMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function StoreHome({
  initialLists,
  products,
  initialStoreOpen,
  payoutsConnected,
  gates,
  plan,
  galleries,
  attachments,
  setupMode,
}: {
  initialLists: PriceListRow[];
  products: ProductRow[];
  initialStoreOpen: boolean;
  payoutsConnected: boolean;
  gates: Gates;
  plan: string;
  galleries: GalleryOption[];
  attachments: StoreAttachmentRow[];
  setupMode: boolean;
}) {
  const router = useRouter();
  const [lists, setLists] = useState(initialLists);
  const [storeOpen, setStoreOpen] = useState(initialStoreOpen);
  const [serverOpen, setServerOpen] = useState(initialStoreOpen);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<"idle" | "preparing" | "error">("idle");
  const [previewSeen, setPreviewSeen] = useState(false);

  /* WEBC-121: setup-wizard state — active attachments live locally after
   * an attach; the card hides once the store is sellable (or dismissed). */
  const [atts, setAtts] = useState<StoreAttachmentRow[]>(attachments);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [attachListId, setAttachListId] = useState(initialLists[0]?.id ?? "");
  const [attachGrantId, setAttachGrantId] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const wizardRef = useRef<HTMLDivElement | null>(null);

  const firstRun = lists.length === 0;
  const atCap = gates.maxPriceLists >= 0 && lists.length >= gates.maxPriceLists;
  const hasProducts = products.length > 0;
  const setupComplete = hasProducts && storeOpen && atts.length > 0;
  const showWizard = !setupComplete && !setupDismissed;

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  /* ?setup=1 — the Setup Guide deep link: bring the wizard into view and
   * ring it for a few seconds so the step lands somewhere, not nowhere. */
  useEffect(() => {
    if (!setupMode) return;
    wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    wizardRef.current?.classList.add("ring-2", "ring-primary");
    const fade = setTimeout(() => wizardRef.current?.classList.remove("ring-2", "ring-primary"), 4000);
    return () => clearTimeout(fade);
  }, [setupMode]);

  function showToast(kind: "success" | "error", text: string) {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }

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

  /* Optimistic store-status toggle: flip immediately, revert to server
   * truth + error toast when the server refuses (handoff: "nothing
   * changed. Try again."). */
  async function toggleStore() {
    const next = !storeOpen;
    setStoreOpen(next);
    setToggleBusy(true);
    try {
      const res = await fetch("/api/studio/store-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: next }),
      });
      if (!res.ok) throw new Error("status_failed");
      setServerOpen(next);
      showToast(
        "success",
        next ? "Store opened — Buy buttons are live on your galleries." : "Store closed — Buy buttons are hidden on your galleries.",
      );
    } catch {
      setStoreOpen(serverOpen); // server truth — nothing changed
      showToast("error", "Couldn't update the store status — nothing changed. Try again.");
    } finally {
      setToggleBusy(false);
    }
  }

  /* First-run template: single POST seeds the whole list; failure leaves
   * the empty state untouched. */
  async function useTemplate(templateId: string) {
    setTemplateBusy(templateId);
    setError(null);
    try {
      const res = await fetch("/api/studio/commerce/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateId }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "template_failed");
      router.push(`/dashboard/store/${body.id}`);
    } catch {
      setTemplateBusy(null);
      showToast("error", "We couldn't create your price list — nothing changed. Try again.");
    }
  }

  /* Preview as client: POST mints the server-side preview session (the
   * flag that makes order mutations refuse), then opens the client view
   * beside the dashboard. Never creates a real order. */
  async function openPreview() {
    setPreview("preparing");
    try {
      const res = await fetch("/api/studio/store-preview", { method: "POST" });
      const body = (await res.json()) as { url?: string };
      if (!res.ok || !body.url) throw new Error("preview_failed");
      window.open(body.url, "_blank", "noopener");
      setPreview("idle");
      setPreviewSeen(true);
    } catch {
      setPreview("error");
    }
  }

  /* WEBC-121 wizard step 3: attach a price list to a gallery (the client
   * store reads the ACTIVE assignment server-side; one per gallery). */
  async function attachToGallery() {
    if (!attachListId || !attachGrantId) return;
    setAttachBusy(true);
    try {
      const res = await fetch(`/api/studio/commerce/${attachListId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachGrantId }),
      });
      if (!res.ok) throw new Error("attach_failed");
      const list = lists.find((l) => l.id === attachListId);
      const gallery = galleries.find((g) => g.id === attachGrantId);
      setAtts((cur) => [
        // re-attaching moves a gallery — drop its previous active row
        ...cur.filter((a) => a.grantId !== attachGrantId),
        { grantId: attachGrantId, priceListId: attachListId, priceListName: list?.name ?? "", projectTitle: gallery?.projectTitle ?? "—" },
      ]);
      setAttachGrantId("");
      showToast("success", `Attached — clients on “${gallery?.projectTitle ?? "that gallery"}” see ${list?.name ?? "your price list"}.`);
    } catch {
      showToast("error", "Couldn't attach the price list — nothing changed. Try again.");
    }
    setAttachBusy(false);
  }

  const wizardSteps = [
    { n: 1, title: "Create your first price list", done: hasProducts },
    { n: 2, title: "Open your store", done: storeOpen },
    { n: 3, title: "Attach it to a gallery", done: atts.length > 0 },
    { n: 4, title: "See it as your client", done: previewSeen },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Store</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Studio-wide price lists for your gallery store.
            {gates.maxPriceLists >= 0 ? ` ${gates.maxPriceLists} list${gates.maxPriceLists === 1 ? "" : "s"} on your plan.` : " Unlimited lists on your plan."}
          </p>
        </div>
        {!firstRun && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openPreview} disabled={preview === "preparing"}>
              <ExternalLink className="mr-1 h-4 w-4" /> Preview as client
            </Button>
            <Button onClick={() => setWizardOpen(true)} disabled={atCap}>
              <Plus className="mr-1 h-4 w-4" /> New price list
            </Button>
          </div>
        )}
      </div>

      {/* Preview states (handoff: preparing / error) */}
      {preview === "preparing" && (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-ink-tertiary" aria-hidden />
          <div>
            <p className="text-sm font-medium text-ink">Preparing your store preview…</p>
            <p className="text-xs text-ink-subtle">This opens your store exactly as a client sees it. Nothing can be ordered.</p>
          </div>
        </div>
      )}
      {preview === "error" && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-hairline bg-surface px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">We couldn&apos;t open the preview</p>
            <p className="text-xs text-ink-subtle">Nothing was changed — your store is untouched. Check your connection and try again.</p>
          </div>
          <Button size="sm" onClick={openPreview}>Try again</Button>
        </div>
      )}

      {/* Payouts banner (first run only, per handoff) */}
      {firstRun && !payoutsConnected && (
        <p className="rounded-lg border border-hairline bg-canvas px-4 py-3 text-sm text-ink-subtle">
          Payouts aren&apos;t connected yet. Your store is built, but sales can&apos;t start until deposits have somewhere to land.{" "}
          <Link href="/dashboard/settings/payouts" className="font-medium text-primary hover:underline">Connect payouts</Link>
        </p>
      )}

      {/* Store status card */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hairline bg-surface px-4 py-3.5">
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${storeOpen ? "bg-success" : "bg-hairline-strong"}`}
        />
        <div className="min-w-[220px] flex-1">
          {firstRun ? (
            <>
              <p className="font-medium text-ink">Your store isn&apos;t open yet</p>
              <p className="text-sm text-ink-subtle">Create a price list, then open the store when you&apos;re ready.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-ink">{storeOpen ? "Your store is open" : "Your store is closed"}</p>
              <p className="text-sm text-ink-subtle">
                {storeOpen ? "Buy buttons are live on every gallery with an active price list." : "Clients can browse galleries, but Buy buttons are hidden."}
              </p>
            </>
          )}
        </div>
        {/* WEBC-121 F2: a closed store gets a plain primary action next to
         * the toggle — the money step shouldn't live in a subtle switch. */}
        {!storeOpen && !firstRun && (
          <Button size="sm" onClick={toggleStore} disabled={toggleBusy}>
            {toggleBusy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Open store
          </Button>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={storeOpen}
            aria-label={storeOpen ? "Close the store" : "Open the store"}
            disabled={firstRun || toggleBusy}
            onClick={toggleStore}
            className={`relative h-6 w-11 rounded-full border transition-colors ${
              storeOpen ? "border-primary bg-primary" : "border-hairline bg-surface-2"
            } disabled:opacity-50`}
          >
            {/* Thumb is anchored with left-0.5 and moved with translate —
             * translate alone offsets from the span's UA "static position",
             * which inside a <button> is the centered-content point, not the
             * track's left edge (knob detached ~18px past the track when ON). */}
            <span
              aria-hidden
              className={`store-status-switch-thumb absolute left-0.5 top-0.5 rounded-full bg-white shadow transition-transform ${
                storeOpen ? "translate-x-[22px]" : "translate-x-0"
              }`}
              style={{ height: 18, width: 18 }}
            />
          </button>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              storeOpen ? "bg-success/10 text-success" : "bg-surface-2 text-ink-tertiary"
            }`}
          >
            {storeOpen ? "Open" : "Closed"}
          </span>
        </div>
      </div>

      {/* WEBC-121 (F2+F9): the Store setup wizard — the guided path from
       * empty store to first sale. Shows until the store is sellable
       * (product + open + attached) or the studio dismisses it; the Setup
       * Guide's "Set up your store" step deep-links in with ?setup=1. */}
      {showWizard && (
        <div
          ref={wizardRef}
          className="flex flex-col gap-4 rounded-xl border border-hairline bg-surface px-5 py-6 transition-shadow"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">Set up your store</h2>
              <p className="mt-1 text-sm text-ink-subtle">
                Four steps from empty to your first sale — most studios finish in about ten minutes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSetupDismissed(true)}
              className="text-xs font-medium text-ink-tertiary hover:text-ink"
            >
              Hide setup steps
            </button>
          </div>
          <ol className="flex flex-col gap-4">
            {wizardSteps.map((s) => (
              <li key={s.n} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    s.done ? "border-primary bg-primary text-white" : "border-hairline bg-surface-2 text-ink-tertiary"
                  }`}
                >
                  {s.done ? <Check className="h-3 w-3" /> : s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${s.done ? "text-ink-tertiary line-through" : "text-ink"}`}>{s.title}</p>
                  {s.n === 1 && !s.done && (
                    firstRun ? (
                      <div className="mt-3 flex flex-col gap-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          {TEMPLATE_CARDS.map((t) => (
                            <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-hairline bg-canvas px-4 py-4">
                              <p className="font-medium text-ink">{t.name}</p>
                              <p className="flex-1 text-xs text-ink-tertiary">{t.blurb}</p>
                              <Button size="sm" variant="outline" onClick={() => useTemplate(t.id)} disabled={templateBusy !== null}>
                                {templateBusy === t.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Use template
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div>
                          <Button variant="ghost" size="sm" onClick={() => setWizardOpen(true)} disabled={atCap}>
                            <Plus className="mr-1 h-4 w-4" /> Start from scratch
                          </Button>
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-ink-subtle">
                        Your list {lists[0] ? `“${lists[0].name}”` : ""} has no products yet —{" "}
                        <a href={lists[0] ? `/dashboard/store/${lists[0].id}` : "#"} className="font-medium text-primary hover:underline">
                          add your first product
                        </a>
                        .
                      </p>
                    )
                  )}
                  {s.n === 2 && !s.done && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={toggleStore} disabled={firstRun || toggleBusy}>
                        {toggleBusy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Open your store
                      </Button>
                      <span className="text-xs text-ink-tertiary">
                        {firstRun ? "Available once your price list exists — Buy buttons stay hidden until then." : "Buy buttons go live on every gallery with an active price list."}
                      </span>
                    </div>
                  )}
                  {s.n === 3 && !s.done && (
                    galleries.length === 0 ? (
                      <p className="mt-1 text-sm text-ink-subtle">
                        No galleries delivered yet —{" "}
                        <Link href="/dashboard/projects" className="font-medium text-primary hover:underline">send a client gallery</Link>
                        , then attach this list to it.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={attachListId}
                          onChange={(e) => setAttachListId(e.target.value)}
                          aria-label="Price list to attach"
                          className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
                        >
                          {lists.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                        <span aria-hidden className="text-sm text-ink-tertiary">→</span>
                        <select
                          value={attachGrantId}
                          onChange={(e) => setAttachGrantId(e.target.value)}
                          aria-label="Gallery to attach it to"
                          className="snap-select max-w-56 rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
                        >
                          <option value="">Pick a gallery…</option>
                          {galleries.map((g) => (
                            <option key={g.id} value={g.id}>{g.projectTitle}</option>
                          ))}
                        </select>
                        <Button size="sm" onClick={attachToGallery} disabled={!attachListId || !attachGrantId || attachBusy}>
                          {attachBusy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Attach
                        </Button>
                      </div>
                    )
                  )}
                  {s.n === 3 && atts.length > 0 && (
                    <ul className="mt-1 text-xs text-ink-tertiary">
                      {atts.map((a) => (
                        <li key={a.grantId}>
                          {a.priceListName} → {a.projectTitle}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.n === 4 && !s.done && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={openPreview} disabled={preview === "preparing"}>
                        {preview === "preparing" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1 h-4 w-4" />}
                        Preview as client
                      </Button>
                      <span className="text-xs text-ink-tertiary">Exactly what your client sees — nothing can be ordered.</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* First run welcome line (the picker itself lives in wizard step 1) */}
      {firstRun && (
        <p className="text-sm text-ink-subtle">
          Welcome to your store. Price lists are shared across your galleries — one active list per gallery. Start from a template, then make it yours.
        </p>
      )}

      {!firstRun && (
        <Tabs defaultValue="lists">
          <TabsList>
            <TabsTrigger value="lists">Price lists</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>

          {/* Price lists tab */}
          <TabsContent value="lists">
            {atCap && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3">
                <div className="min-w-56">
                  <p className="text-sm font-medium text-ink">You&apos;re using every price list your plan allows</p>
                  <p className="mt-0.5 text-sm text-ink-subtle">
                    {NEXT_TIER_UNLOCKS[plan] ?? "Upgrade for more price lists, packages, and custom products."}
                  </p>
                </div>
                <Link
                  href="/dashboard/settings/billing"
                  className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  See plans &amp; upgrade
                </Link>
              </div>
            )}
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-tertiary">
                    <th className="px-4 py-2.5 font-medium">Price list</th>
                    <th className="px-4 py-2.5 font-medium">Products</th>
                    <th className="px-4 py-2.5 font-medium">Currency</th>
                    <th className="px-4 py-2.5 font-medium" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {lists.map((l) => (
                    <tr key={l.id} className="border-b border-hairline last:border-0">
                      {renaming?.id === l.id ? (
                        <td colSpan={4} className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Input value={renaming.name} onChange={(e) => setRenaming({ id: l.id, name: e.target.value })} className="max-w-64" />
                            <Button size="sm" onClick={rename} disabled={busy}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2.5">
                            <a href={`/dashboard/store/${l.id}`} className="font-medium text-ink hover:underline">
                              {l.name}
                              {l.isDefault && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Default</span>}
                            </a>
                          </td>
                          <td className="px-4 py-2.5 text-ink-subtle tabular-nums">
                            {l.productCount} product{l.productCount === 1 ? "" : "s"}
                          </td>
                          <td className="px-4 py-2.5 text-ink-subtle">{l.currency}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
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
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Products overview tab */}
          <TabsContent value="products">
            {products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-hairline bg-surface px-6 py-12 text-center">
                <h2 className="font-semibold text-ink">Products live inside price lists</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-subtle">
                  Open a price list to add digitals, prints, packages, and custom items — with per-variant cost, markup, and price.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-tertiary">
                      <th className="px-4 py-2.5 font-medium">Product</th>
                      <th className="px-4 py-2.5 font-medium">Kind</th>
                      <th className="px-4 py-2.5 font-medium">Price list</th>
                      <th className="px-4 py-2.5 font-medium">Variants</th>
                      <th className="px-4 py-2.5 font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-b border-hairline last:border-0">
                        <td className="px-4 py-2.5 font-medium text-ink">
                          {!p.active && <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-tertiary">Archived</span>}
                          {p.name}
                        </td>
                        <td className="px-4 py-2.5 text-ink-subtle">{KIND_LABELS[p.kind] ?? p.kind}</td>
                        <td className="px-4 py-2.5">
                          <a href={`/dashboard/store/${p.priceListId}`} className="text-ink-subtle hover:underline">{p.priceListName}</a>
                        </td>
                        <td className="px-4 py-2.5 text-ink-subtle tabular-nums">{p.variantCount}</td>
                        <td className="px-4 py-2.5 text-ink-subtle tabular-nums">
                          {p.minPriceCents === null
                            ? "—"
                            : p.minPriceCents === p.maxPriceCents
                              ? fmtMoney(p.minPriceCents, p.priceListCurrency)
                              : `${fmtMoney(p.minPriceCents, p.priceListCurrency)} – ${fmtMoney(p.maxPriceCents!, p.priceListCurrency)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Toast (handoff: role=status, switch/state feedback) */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.kind === "success" ? "border-hairline bg-surface text-ink" : "border-destructive/40 bg-surface text-destructive"
          }`}
        >
          {toast.text}
        </div>
      )}

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
 * the user straight into the list editor. (WEB-179; unchanged by WEB-277.) */
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
