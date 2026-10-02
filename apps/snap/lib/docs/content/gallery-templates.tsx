/* Gallery templates & page builder — authored from components/
 * gallery-template-picker.tsx (category chips, R2 thumbs + mobile crop badge,
 * apply confirm + client-side undo), lib/seed-templates.ts (the ten seeds,
 * adaptSeedToProject positional remap incl. wrap-around), app/api/projects/
 * [id]/gallery-template/route.ts (design-only, every tier, returns the
 * previous design, audit-logged), components/gallery-builder.tsx +
 * app/dashboard/projects/[id]/builder/page.tsx (three panes, ⌘Z/⇧⌘Z, draft
 * autosave, stale-session guard, Reset to template, Free lock, phone notice,
 * Save writes template:"custom"), lib/gallery-design.ts (SECTION_TYPES,
 * designMinTier), lib/fonts.ts (twelve-family self-hosted pack), and
 * lib/repos/templates.ts (countCustomGalleryPresets — Lite's one saved
 * custom look; starters don't count). */
import { H2, Tier, Related } from "@/lib/docs/primitives";

export default function GalleryTemplates() {
  return (
    <>
      <p>
        Ten designer gallery templates ship with Snap — wedding, family, party, corporate, and
        editorial looks, each one a complete page: hero, photo sections, favorites, a closing
        note. Preview any of them rendered with <em>your</em> photos, apply it in one click, and
        keep the previous design a keystroke away. Applying is free on every plan; from Lite up,
        the page builder makes any template entirely yours.
      </p>

      <H2>Pick a template</H2>
      <p>
        The <strong>Client gallery</strong> tab on any project opens with the template grid —
        category chips (All, Wedding, Family, Party, Corporate, Editorial, Minimal) over ten
        cards. Each card shows the template rendered for real, with a phone-sized crop beside the
        desktop preview; the current one wears a <strong>✓ Applied</strong> badge. Click a card
        to see it as your client will — the same client-accurate preview as the designer&apos;s,
        your photos substituted in, and preview opens never count as views. New studios meet this
        grid as a step in the <a href="/docs/start-guide">Start guide</a>.
      </p>

      <H2>Apply — and undo</H2>
      <p>
        <strong>Apply</strong> restyles the gallery in one click; replacing a design you already
        customized asks for an inline Confirm first. Applying is design-only — photos, favorites,
        and every delivery setting stay untouched — and instant: the template&apos;s sample photos
        are stand-ins for your own, in delivery order, and a gallery shorter than the template&apos;s
        picks reuses its photos rather than showing gaps. Rating filters inside a template keep
        working on any gallery. Changed your mind? <strong>Undo</strong> sits beside the
        confirmation and restores your previous design exactly. A pristine template application
        saves free on every plan; a save from the builder marks the design{" "}
        <em>custom</em> — and <strong>Reset to template</strong> returns you to the pristine
        starting point any time.
      </p>

      <H2>The ten templates</H2>
      <table>
        <thead>
          <tr>
            <th>Template</th>
            <th>Category</th>
            <th>The look</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Classic Wedding</td>
            <td>Wedding</td>
            <td>Split cover, soft masonry grid, serif headlines — timeless.</td>
          </tr>
          <tr>
            <td>Dark Cinematic</td>
            <td>Wedding</td>
            <td>Night-reception energy — Ken Burns hero, tight dark grid, gold on black.</td>
          </tr>
          <tr>
            <td>Editorial Wedding</td>
            <td>Wedding</td>
            <td>Full-bleed statement cover, justified photo rows, magazine serif — high fashion.</td>
          </tr>
          <tr>
            <td>Family Warm</td>
            <td>Family</td>
            <td>Sun-washed statement cover, playful collage, big cozy tiles — golden-hour warmth on every scroll.</td>
          </tr>
          <tr>
            <td>Newborn Soft</td>
            <td>Family</td>
            <td>Cream linen calm, an airy serif, and first days in a soft three-column masonry.</td>
          </tr>
          <tr>
            <td>Party Energy</td>
            <td>Party</td>
            <td>Neon-dark, tilted photo collage, Bebas headlines — pure party adrenaline.</td>
          </tr>
          <tr>
            <td>Corporate Clean</td>
            <td>Corporate</td>
            <td>Crisp square grid, Inter type, straight to the photos — headshot &amp; event delivery without the frills.</td>
          </tr>
          <tr>
            <td>Luxury</td>
            <td>Editorial</td>
            <td>Champagne gold on near-black — full-bleed hero, curated highlights, Playfair serif.</td>
          </tr>
          <tr>
            <td>Magazine</td>
            <td>Editorial</td>
            <td>Full-bleed fashion cover, cover-story row, cascade spread — Fraunces serif, an actual issue.</td>
          </tr>
          <tr>
            <td>Minimal Mono</td>
            <td>Minimal</td>
            <td>Near-white canvas, ink-black type, tight square grid — the gallery as a quiet exhibition.</td>
          </tr>
        </tbody>
      </table>

      <H2>The page builder <Tier plan="lite" /></H2>
      <p>
        <strong>Open page builder</strong> sits atop the template grid (on Free the panel is
        honest about the lock and points at the upgrade; the builder itself is desktop-first —
        phones get a notice pointing back at the templates). Three panes: your sections on the
        left — drag to reorder, duplicate, remove, add from seven types (hero, gallery, slideshow,
        favorites, collage, text, contact); the real client gallery in the center with a
        desktop/phone toggle, click any section to select it; a schema-driven inspector on the
        right — padding and background per section, hero styles and cover picks, slider interval,
        layout and column density, and which photos each section shows: all, one folder, your
        N-star ratings, or hand-picked frames. Client-side view tabs (Gallery / Favorites / Info)
        are a toggle, not a route. Undo/redo run deep (⌘Z / ⇧⌘Z), drafts autosave locally while
        you work, and a stale-session guard compares against the saved design before anything
        overwrites it. <strong>Save</strong> writes through the same design API the designer uses;
        text sections accept plain formatting only, sanitized before they store.
      </p>

      <H2>Type, color, and collages</H2>
      <p>
        The Theme pane <Tier plan="lite" /> carries twelve typefaces — Playfair Display, Cormorant
        Garamond, Space Grotesk, Fraunces, Work Sans, and six more — rendered in their own faces
        in the picker and served from Snap itself: no external font request ever touches your
        client&apos;s gallery. A type-scale slider (0.8–1.4×), letter-spacing, page/text/accent
        colors with one-click match-my-brand, corner radius, and captions round it out. The
        collage section <Tier plan="studio" /> frees photos from the grid entirely: drag to move,
        corner to resize, rotate to ±15°, layer the z-order — up to twelve photos per
        composition, stacking full-width on phones if you let them.
      </p>

      <H2>Limits, and how templates meet presets</H2>
      <p>
        Applying is unlimited on every plan. The builder is Lite and above, collages Studio and
        above, and Lite keeps one saved custom look where Studio and above are unlimited.
        Templates are starting points — apply one per gallery and change it as often as you like.
        Presets are the looks you compose yourself, saved into your{" "}
        <a href="/docs/template-library">template library</a> with a studio default; the designer
        side of all this — covers, layouts, themes, slideshows — lives in{" "}
        <a href="/docs/gallery-design">Gallery design &amp; styles</a>.
      </p>

      <Related slugs={["gallery-design", "gallery-delivery", "template-library", "start-guide"]} />
    </>
  );
}
