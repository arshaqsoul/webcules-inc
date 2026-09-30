/* Films & video delivery — docs-shell restructure of app/docs/video/page.tsx
 * (facts preserved), verified against lib/uploads.ts (VIDEO_MAX_BYTES 4 GB),
 * lib/gallery-design.ts (films flag), and components/gallery-view.tsx (Films
 * section, Reels strip, one-playback-one-view counting). */
import { H2, Callout, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function Video() {
  return (
    <>
      <p>
        We deliver your films bit-exact, like your photos. No transcoding, no re-encoding, no
        quality loss — the file you upload is the file your client plays and downloads. That
        choice keeps delivery free (storage is metered, streaming isn&apos;t) and your footage
        untouched.
      </p>

      <H2>What plays everywhere</H2>
      <p>
        Export <strong>H.264 MP4</strong> for universal playback — every browser, phone, and TV.
        WebM plays in all modern browsers. MOV works when it holds H.264;{" "}
        <strong>HEVC/H.265</strong> (common in iPhone footage and some MOV files) may not play on
        every device — clients on unsupported devices see an honest &ldquo;may not play
        here&rdquo; note with a download fallback instead of a black box.
      </p>

      <H2>How delivery works</H2>
      <p>
        Videos ride the same direct-to-storage upload pipeline as your photos, big files included.
        In the gallery, each one gets a poster frame and streams straight from the original file
        over range requests — seeking is instant because there is no processing queue between your
        export and your client&apos;s screen. Storage is the only meter: playback never costs
        extra.
      </p>

      <H2>In the gallery</H2>
      <p>
        Videos appear right alongside photos with a play badge and duration. Turn on the{" "}
        <strong>Films section</strong> in a gallery&apos;s Design tab <Tier plan="lite" /> and
        videos get their own section — horizontal films as wide cards, and clips taller than they
        are wide (9:16 and narrower) in a swipeable <strong>Reels</strong> strip built for phone
        screens. Slideshows stay photo-only. Video downloads follow each gallery&apos;s download
        setting, always the original file.
      </p>

      <Shot
        src="/docs-shots/video/films-section.png"
        alt="A public client gallery with the Films section on — horizontal films as wide cards above a swipeable Reels strip of vertical clips."
        grad="night"
        wide
      />

      <H2>Limits, honestly</H2>
      <Callout tone="info" title="The real numbers">
        <ul>
          <li>
            Videos up to <strong>4 GB per file</strong> (rejected at upload with a clear error
            above that).
          </li>
          <li>
            Resolution is whatever you uploaded — 4K stays 4K. There&apos;s no adaptive bitrate: a
            4K file needs a connection that can carry it.
          </li>
          <li>Videos count against your plan&apos;s storage exactly like photos.</li>
          <li>
            Playback counts as one gallery view per watch — scrubbing and seeking never multiply
            the count.
          </li>
        </ul>
      </Callout>

      <Related slugs={["gallery-delivery", "gallery-design", "billing-plans"]} />
    </>
  );
}
