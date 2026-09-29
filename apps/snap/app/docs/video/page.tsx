/* Films & video delivery (WEB-260) — the honest docs page: bit-exact
 * delivery, no transcoding, the supported format set, and the 4 GB cap.
 * Public (no auth). */
import type { Metadata } from "next";
import { SnapMark } from "@/components/snap-mark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Films & video delivery",
  description:
    "How Snap delivers video in client galleries: bit-exact playback from the original file (no transcoding, no quality loss), the formats that play everywhere, and the honest limits.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-.3px] text-ink">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-subtle">{children}</div>
    </section>
  );
}

export default function VideoDocsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SnapMark className="h-5 w-5" />
          <span className="text-sm font-medium text-ink">Snap docs</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-.8px] text-ink">Films &amp; video delivery</h1>
        <p className="text-sm leading-relaxed text-ink-subtle">
          We deliver your films bit-exact, like your photos. No transcoding, no re-encoding, no quality loss — the
          file you upload is the file your client plays and downloads. That choice keeps delivery free (storage is
          metered, streaming isn&apos;t) and your footage untouched.
        </p>
      </header>

      <Section title="What plays everywhere">
        <p>
          Export <strong>H.264 MP4</strong> for universal playback — every browser, phone, and TV. WebM plays in all
          modern browsers. MOV works when it holds H.264; <strong>HEVC/H.265</strong> (common in iPhone footage and
          some MOV files) may not play on every device — clients on unsupported devices see an honest &ldquo;may not
          play here&rdquo; note with a download fallback instead of a black box.
        </p>
      </Section>

      <Section title="Limits, honestly">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Videos up to <strong>4 GB per file</strong> (rejected at upload with a clear error above that).</li>
          <li>Resolution is whatever you uploaded — 4K stays 4K. There&apos;s no adaptive bitrate: a 4K file needs a connection that can carry it.</li>
          <li>Videos count against your plan&apos;s storage exactly like photos.</li>
          <li>Playback counts as one gallery view per watch — scrubbing and seeking never multiply the count.</li>
        </ul>
      </Section>

      <Section title="In the gallery">
        <p>
          Videos appear right alongside photos with a play badge and duration. Turn on the <strong>Films section</strong>{" "}
          in a gallery&apos;s Design tab and videos get their own section — horizontal films as wide cards, vertical
          clips (9:16) in a swipeable Reels strip built for phone screens. Slideshows stay photo-only. Video downloads
          follow each gallery&apos;s download setting, always the original file.
        </p>
      </Section>
    </div>
  );
}
