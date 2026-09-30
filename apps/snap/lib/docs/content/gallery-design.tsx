/* Gallery design & styles — authored from lib/gallery-design.ts (cover/layout/
 * theme enums), lib/slideshow.ts (paces/transitions/music), components/
 * gallery-designer.tsx (presets, studio default, Lite upsells), and the gate
 * matrix (design_requires_lite / music_requires_lite). */
import { H2, H3, Note, Shot, Tier, Related } from "@/lib/docs/primitives";

export default function GalleryDesign() {
  return (
    <>
      <p>
        Design each gallery to match the shoot: a cover photo with a focal point, a layout, a
        theme — then save the combination as a preset your whole studio reuses. The classic gallery
        is free; the design layer on top of it is Lite and above.
      </p>

      <Shot
        src="/docs-shots/gallery-design/designer.png"
        alt="The gallery designer on a project's Client gallery tab — cover picker with draggable focal point, layout and theme controls, a live phone-frame preview, and the preset list."
        grad="plum"
        wide
      />

      <H2>Free, on every gallery</H2>
      <p>
        Without touching the designer, every gallery ships the classic look: a uniform{" "}
        <strong>grid</strong> on a light canvas, rounded tiles, clean and fast. The basic
        slideshow works on Free too — full-screen, crossfade or Ken Burns motion, at your pace —
        it just plays silent. Favorites, selections, downloads, and every delivery control on{" "}
        <a href="/docs/gallery-delivery">Delivering galleries</a> are never gated.
      </p>

      <H2>The design layer <Tier plan="lite" /></H2>
      <p>
        Open the <strong>Client gallery</strong> tab on any project and the designer sits beside a
        live phone-frame preview. Saving a design is what Lite unlocks — on Free the panel shows
        an upsell instead of a save button.
      </p>

      <H3>Cover</H3>
      <p>
        Pick a cover photo from the project and drag its focal point so the crop lands where you
        want. Three styles: <strong>static</strong> (a still hero), <strong>Ken Burns</strong>{" "}
        (a slow drift), or a <strong>split title panel</strong>. Title and subtitle accept merge
        fields — <code>{"{{client_name}}"}</code>, <code>{"{{event_date}}"}</code> — rendered per
        viewer. No photo picked? The cover falls back to a text-only gradient hero, so presets
        never depend on a specific project&apos;s images.
      </p>

      <H3>Layout</H3>
      <p>
        <strong>Grid</strong> (uniform rows), <strong>masonry</strong> (natural heights, no
        cropping), or <strong>cascade</strong> (an editorial, mixed-scale flow).
      </p>

      <H3>Theme</H3>
      <p>
        <strong>Light</strong>, <strong>dark</strong>, or a <strong>brand tint</strong> mixed over
        your studio accent. Then the details: compact, normal, or airy spacing; square, 8px, or
        16px corners; captions off, on hover, or always (a tile&apos;s caption is its filename,
        minus the extension).
      </p>

      <H2>Presets and your studio default <Tier plan="lite" /></H2>
      <p>
        Save any combination as a named preset in your{" "}
        <a href="/dashboard/templates">template library</a>, and pin one as the{" "}
        <strong>studio default</strong> — new galleries start styled instead of classic. Applying a
        preset keeps the gallery&apos;s current cover photo and takes everything else from the
        preset; editing a preset never rewrites galleries already sent.
      </p>

      <H2>Slideshows</H2>
      <p>
        Pace is 3, 5, or 8 seconds per photo; motion is a plain crossfade or Ken Burns. A{" "}
        <strong>vertical 9:16 mode</strong> reframes the show for phones — built for Stories and
        Reels (the client records their screen to save it). Music is bring-your-own{" "}
        <Tier plan="lite" />: MP3, AAC, or M4A up to 15 MB, uploaded once to a studio library and
        reused across every gallery. You tick a box confirming you own the rights — it&apos;s
        recorded with the upload — and can set where the track starts, so a long intro never
        outruns the first crossfade. On Free the slideshow plays silent.
      </p>
      <Note>
        Turning on a <strong>Films section</strong> is also a design-tab switch — see{" "}
        <a href="/docs/video">Films &amp; video delivery</a> for how videos render.
      </Note>

      <Related slugs={["gallery-delivery", "templates", "video", "brand"]} />
    </>
  );
}
