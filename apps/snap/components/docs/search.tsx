"use client";

/* Docs search — Linear-style ⌘K overlay over a small server-built index
 * (GET /api/docs/search). Opened from the sidebar/header magnifiers or
 * ⌘K / Ctrl+K. V1 keeps it honest: title/heading/body matching with
 * snippets, keyboard-dismissable, first result on Enter. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, FileText, Search } from "lucide-react";

export function openDocsSearch() {
  window.dispatchEvent(new CustomEvent("docs-search"));
}

type SearchHit = {
  slug: string;
  title: string;
  category: string;
  sectionId: string | null;
  heading: string | null;
  snippet: string;
};

export function DocsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("docs-search", onOpen);
    return () => window.removeEventListener("docs-search", onOpen);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const run = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 150);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    router.push(hit.sectionId ? `/docs/${hit.slug}#${hit.sectionId}` : `/docs/${hit.slug}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close search" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
        className="absolute left-1/2 top-[12vh] flex max-h-[64vh] w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-hairline bg-canvas shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              run(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) go(hits[0]);
            }}
            placeholder="Search the docs…"
            className="docs-search-input h-full flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-tertiary"
          />
          <kbd className="hidden rounded border border-hairline bg-surface-1 px-1.5 py-0.5 font-sans text-[10.5px] text-ink-tertiary sm:block">esc</kbd>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && <p className="px-3 py-6 text-center text-[13px] text-ink-tertiary">Searching…</p>}
          {!loading && q.trim().length >= 2 && hits.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-ink-tertiary">No matches for “{q}”.</p>
          )}
          {!loading && q.trim().length < 2 && (
            <p className="px-3 py-6 text-center text-[13px] text-ink-tertiary">
              Type at least two characters — pages, sections, and guides all match.
            </p>
          )}
          {hits.map((hit, i) => (
            <button
              type="button"
              key={`${hit.slug}-${hit.sectionId ?? "page"}-${i}`}
              onClick={() => go(hit)}
              className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-1"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                  {hit.heading ? `${hit.title} — ${hit.heading}` : hit.title}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-ink-subtle">
                  {hit.category} · {hit.snippet}
                </span>
              </span>
              {i === 0 && <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-tertiary opacity-0 group-hover:opacity-100" aria-hidden />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Index-page search field lookalike — a button that opens the dialog. */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={openDocsSearch}
      className="docs-search-input flex h-10 w-full max-w-[560px] items-center gap-2.5 rounded-lg border border-hairline bg-canvas px-3.5 text-[13.5px] text-ink-tertiary transition-colors hover:border-hairline-strong hover:text-ink-subtle"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="flex-1 text-left">Search the documentation…</span>
      <kbd className="rounded border border-hairline bg-surface-1 px-1.5 py-0.5 text-[10.5px]">⌘K</kbd>
    </button>
  );
}
