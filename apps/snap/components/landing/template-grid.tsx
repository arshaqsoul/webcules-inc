import Link from "next/link";

import { FadeUp } from "./text-reveal";
import { SEED_TEMPLATES } from "@/lib/seed-templates";
import { TEMPLATE_PREVIEWS } from "@/lib/template-previews";

/** WEB-323 — the template-grid band: ten designer gallery templates shown
 * with their real photographic previews (static R2 thumbs — fast, cacheable,
 * no live iframes on the landing). The show-and-tell for Template Studio. */
export function TemplateGridSection() {
  const seeds = SEED_TEMPLATES.filter((t) => TEMPLATE_PREVIEWS[t.key]).slice(0, 10);
  if (!seeds.length) return null;
  return (
    <section aria-label="Gallery templates" className="border-y border-hairline bg-background py-16 sm:py-20">
      <FadeUp className="mx-auto mb-10 max-w-2xl px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">
          Template Studio
        </p>
        <h2 className="snap-display mt-3 text-4xl leading-tight text-ink sm:text-5xl">
          Pick a look. <em className="italic">Swap in your photos.</em>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-subtle">
          Ten designer gallery templates — wedding to editorial, dark cinematic to soft newborn — free on every plan.
          Make one yours down to the font, or build your own in the drag-and-drop page builder.
        </p>
      </FadeUp>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 sm:grid-cols-3 lg:grid-cols-5">
        {seeds.map((t) => (
          <figure key={t.key} className="group relative overflow-hidden rounded-xl border border-hairline">
            {/* eslint-disable-next-line @next/next/no-img-element -- static R2 thumb */}
            <img
              src={TEMPLATE_PREVIEWS[t.key].desktop}
              alt={`${t.name} gallery template`}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
              <span className="block text-xs font-semibold text-white">{t.name}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <FadeUp className="mt-10 text-center">
        <Link
          href="/signup?plan=free"
          className="inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-background transition-transform hover:scale-[1.02]"
        >
          Start free — pick yours
        </Link>
      </FadeUp>
    </section>
  );
}
