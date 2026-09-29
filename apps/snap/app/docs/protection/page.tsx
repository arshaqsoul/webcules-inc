/* Photo protection, honestly (WEB-243) — the docs page competitors can't
 * write: layered defense with zero false claims. Public (no auth). */
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Photo protection, honestly",
  description:
    "How Snap protects client photos: previews-not-originals by default, optional watermarks, right-click deterrence, and expiring verified links — layered, honest, no screenshot-protection theater.",
};

function Layer({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-subtle">{children}</div>
    </section>
  );
}

export default function ProtectionDocsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-[-.8px] text-ink">Photo protection, honestly</h1>
        <p className="text-sm leading-relaxed text-ink-subtle">
          Every gallery platform markets &quot;protection.&quot; Some of it is real, and some of it is theater —
          nobody can stop a client from photographing their screen with a phone. This page is the straight
          version: the layers Snap actually gives you, what each one does, and what none of them can do.
        </p>
      </header>

      <Layer n={1} title="Galleries serve previews, not originals">
        Client galleries render compressed preview images — full-resolution originals are only served through the
        explicit download action you control, per gallery. A saved preview is a ~1600px image, not your
        deliverable file.
      </Layer>

      <Layer n={2} title="Verified, expiring, revocable links">
        Every gallery lives behind an email-verified link (a one-time code, not a guessable password). You set the
        expiry, you can revoke or rotate the link at any moment, and access is logged — views, OTP outcomes,
        downloads.
      </Layer>

      <Layer n={3} title="Optional watermarks (Studio & Pro)">
        Your logo or studio name — corner, tiled, or text — composited onto gallery previews. Downloads stay clean
        by default, and <strong>proofing galleries</strong> flip that: clients get watermarked files until they
        buy, then you deliver the clean set.
      </Layer>

      <Layer n={4} title="Right-click & long-press deterrence (Studio & Pro)">
        One toggle disables right-click menus, drag-to-desktop and long-press save prompts on gallery photos. It
        stops the casual right-click-save. It does not stop screenshots, screen recording, or a camera pointed at
        the screen — and any platform that tells you otherwise is selling theater.
      </Layer>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">The honest summary</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          Layered protection raises the effort required to take what isn&apos;t theirs — and gives you an audit
          trail when it matters. It cannot make taking impossible; nothing can. Watermark your previews, use
          proofing galleries for pre-sale delivery, revoke links when a gallery&apos;s job is done — and deliver
          your paying clients the clean, full-resolution files they paid for.
        </p>
        <p className="mt-3 text-sm text-ink-subtle">
          Turn the layers on in{" "}
          <Link href="/dashboard/settings/brand" className="text-primary hover:underline">
            Settings → Brand
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
