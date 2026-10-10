/* Cull assist & photo editing (WEB-401/402) — quality analysis at upload,
 * near-duplicate grouping, flags/filters, and the non-destructive develop
 * panel with auto-enhance, presets, and copy/paste. Facts from
 * lib/image-analysis.ts, lib/edits.ts, components/edit-panel.tsx,
 * components/edit-canvas.ts, components/project-files.tsx and the asset
 * serving paths in app/api/assets/[id]/route.ts. */
import { H2, H3, Note, Steps, Related } from "@/lib/docs/primitives";

export default function CullAndEdit() {
  return (
    <>
      <p>
        After a shoot, the real work is choosing and finishing: keep the best frames, fix the
        light, deliver one consistent look. Snap now helps with both halves — every photo you
        upload is analyzed for focus and exposure, near-identical frames are grouped into stacks,
        and a built-in editor gives you Lightroom-style sliders, auto-enhance, presets, and
        copy/paste without ever touching your originals.
      </p>

      <H2>What happens at upload</H2>
      <p>
        The moment a photo lands, your browser grades it in the same pass that builds its
        thumbnails — no extra upload, no waiting, nothing sent to a third party. Two things come
        out of that pass:
      </p>
      <Steps
        items={[
          <>
            <strong>Quality scores.</strong> A focus score (0–100, from edge energy), average
            brightness, and how much of the frame is clipped to black or white. Photos that look
            measurably off get a badge: <em>◐ soft</em>, <em>▾ dark</em>, or <em>▴ bright</em>.
          </>,
          <>
            <strong>A perceptual fingerprint.</strong> A tiny signature of the photo's structure,
            used to find near-identical frames — the burst where the pose barely moved, the
            double-take, the same smile twice.
          </>,
        ]}
      />
      <Note>
        Flags and scores are hints, never verdicts. Nothing is ever auto-rejected, auto-rated, or
        hidden — a flagged photo stays in your grid, just easier to find when you want it.
        Videos, RAWs, and photos uploaded before this feature simply have no badges.
      </Note>

      <H2>Culling with the assist</H2>
      <p>
        Everything lives in the project's <strong>Files</strong> tab, alongside the culling tools
        that were already there (stars, color labels, triage mode, keyboard shortcuts):
      </p>
      <ul>
        <li>
          <strong>Quality filter</strong> — the Filter menu now has a Quality group: Soft focus,
          Too dark, Too bright, Edited, and Similar groups, each with a live count.
        </li>
        <li>
          <strong>Group similar</strong> — one click clusters near-identical frames. Each stack
          shows a <em>⧉ N</em> badge on its sharpest member — that's the suggested pick; the
          others are one click away if the moment calls for them.
        </li>
        <li>
          <strong>Badges everywhere</strong> — the grid cards, the manage pane's details, and
          triage mode all carry the same focus/exposure/similar badges, so the story follows you
          between views.
        </li>
      </ul>
      <p>
        Regrouping runs automatically a few seconds after an upload batch finishes (the
        fingerprints need their thumbnails first), and you can re-run it any time with the{" "}
        <strong>Group similar</strong> button — it's safe to repeat.
      </p>

      <H2>Editing: the develop panel</H2>
      <p>
        Open any photo in Files (click it, or press <kbd>V</kbd>) and the right panel now has an
        <strong> Edit</strong> section with eight sliders: Exposure, Contrast, Highlights,
        Shadows, Temperature, Tint, Vibrance, and Saturation — each −100 to +100, each
        resettable on its own. The preview you see while dragging is rendered by the exact same
        pixel pipeline that produces the delivered file, so what you grade is what your client
        gets.
      </p>

      <H3>Auto</H3>
      <p>
        <strong>Auto</strong> reads the upload analysis and corrects only what's measurably off:
        exposure pulled toward center, clipped highlights recovered, crushed shadows lifted, flat
        (hazy) contrast boosted. It's deterministic math, not a model — the same photo always
        gets the same correction, and a well-exposed photo gets nothing.
      </p>

      <H3>Presets</H3>
      <p>
        Six starter looks ship with Snap (Punch, Soft film, Golden hour, Clean portrait, Cool
        editorial, Black &amp; white). Adjust any of them (or your own grade from scratch), then{" "}
        <strong>Save this look as…</strong> keeps it in <em>your</em> presets for every project
        — they're stored per studio alongside your other templates.
      </p>

      <H3>Copy, paste, and batch-enhance</H3>
      <ul>
        <li>
          <strong>Copy look / Paste look</strong> — in the editor, or from the bulk bar across a
          whole selection. Grade one photo, paste onto hundreds.
        </li>
        <li>
          <strong>Auto-enhance</strong> (bulk bar) — per-photo corrections for an entire
          selection in one call: each frame gets its own exposure and range fix, not one setting
          stamped everywhere.
        </li>
        <li>
          <strong>Clear edits</strong> — removes the look from the selection. Because nothing was
          ever destructive, clearing is instant and complete.
        </li>
      </ul>
      <p>
        Edited looks render in your browser after the settings save — a batch shows its progress
        in the notice line. Until a photo's look finishes rendering, the gallery keeps showing
        its clean version.
      </p>

      <H2>How editing stays safe</H2>
      <Steps
        items={[
          <>
            <strong>Originals are never modified.</strong> The edit is a small set of numbers
            stored beside the photo. Your uploaded file — JPEG or RAW — is byte-for-byte what it
            was.
          </>,
          <>
            <strong>Clients see the look, you keep the negative.</strong> Gallery thumbnails,
            previews, downloads, and ZIPs deliver the edited version (up to 2560&nbsp;px, and it
            honors your watermark settings). Your “Open original” link always serves the
            untouched file.
          </>,
          <>
            <strong>Clearing edits is a full undo.</strong> Remove the look and every surface —
            grid, gallery, downloads — falls back to the clean photo immediately.
          </>,
        ]}
      />

      <Related slugs={["project-hub", "gallery-delivery", "protection", "templates"]} />
    </>
  );
}
