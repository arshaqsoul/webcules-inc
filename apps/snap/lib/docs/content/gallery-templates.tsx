/* Gallery templates & page builder — authored from components/
 * gallery-template-picker.tsx (two tier groups — Free looks, Lite/Studio page
 * layouts — category chips, R2 thumbs + mobile crop badge, plan badges +
 * upgrade buttons on locked cards, apply confirm + client-side undo),
 * lib/seed-templates.ts (the fifteen seeds: 5 cover-only free looks, 7 Lite
 * page layouts, 3 Studio collage layouts; adaptSeedToProject positional remap
 * incl. wrap-around, below-Studio trimming), lib/seed-gating.ts
 * (planMeetsSeedTier — the SERVER-side apply gate, errors
 * template_requires_lite / template_requires_studio), app/api/projects/[id]/
 * gallery-template/route.ts (design-only, tier-gated, returns the previous
 * design, audit-logged), components/gallery-builder.tsx +
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
        Fifteen designer gallery templates ship with Snap, in two kinds. The five{" "}
        <strong>free templates</strong> — including Classic, the default every gallery starts on —
        are complete looks that apply on every plan. The ten{" "}
        <strong>Lite and Studio templates</strong> are full page layouts — wedding, family, party,
        corporate, editorial, and minimal — that preview for everyone and apply from{" "}
        <Tier plan="lite" /> (the collage ones <Tier plan="studio" />). Whichever you pick, you
        see it rendered with <em>your</em> photos before you commit, and keep the previous design
        a keystroke away.
      </p>

      <H2>Pick a template</H2>
      <p>
        The <strong>Client gallery</strong> tab on any project opens with the template grid —
        category chips (All, Wedding, Family, Party, Corporate, Editorial, Minimal) over fifteen
        cards in two groups. Each card shows the template as it really renders — a photographic
        preview where we have one, a card drawn from the design itself (the real body layout, the
        template&apos;s own canvas, ink, accent and corners) where we don&apos;t; the
        photographic ones add a phone-sized crop beside the desktop preview. The current one
        wears a <strong>✓ Applied</strong> badge. Click any
        card to see it as your client will — the same client-accurate preview as the
        designer&apos;s, your photos substituted in, and preview opens never count as views.
        Templates your plan can&apos;t apply yet are still previewable: they carry a{" "}
        <strong>Lite plan</strong> or <strong>Studio plan</strong> badge and an upgrade button
        instead of Apply. New studios meet this grid as a step in the{" "}
        <a href="/docs/start-guide">Start guide</a>.
      </p>

      <H2>Apply — and undo</H2>
      <p>
        <strong>Apply</strong> restyles the gallery in one click; replacing a design you already
        customized asks for an inline Confirm first. Applying is design-only — photos, favorites,
        and every delivery setting stay untouched — and instant: the template&apos;s sample photos
        are stand-ins for your own, in delivery order, and a gallery shorter than the
        template&apos;s picks reuses its photos rather than showing gaps. Rating filters inside a
        template keep working on any gallery. The free looks carry no copy of their own, so your
        title, subtitle, and cover photo stay exactly as you set them. Changed your mind?{" "}
        <strong>Undo</strong> sits beside the confirmation and restores your previous design
        exactly.
      </p>
      <p>
        Which templates apply is enforced on the server, not just hidden in the interface: a plan
        below the template&apos;s tier gets &ldquo;That template needs the Lite plan&rdquo; (or
        Studio). Below Studio, a template&apos;s Studio-only controls — a multi-photo hero slider,
        per-section column counts — are trimmed at apply time (the hero keeps its first photo), so
        what your plan applies always saves cleanly. A pristine application isn&apos;t a custom
        design; a save from the builder marks the design <em>custom</em> — and{" "}
        <strong>Reset to template</strong> returns you to the pristine starting point any time.
      </p>

      <H2>The fifteen templates</H2>
      <table>
        <thead>
          <tr>
            <th>Template</th>
            <th>Plan</th>
            <th>Category</th>
            <th>The look</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Classic</td>
            <td>Free</td>
            <td>Minimal</td>
            <td>The default — a clean cover, a tidy grid, your photos front and centre.</td>
          </tr>
          <tr>
            <td>Soft Serif</td>
            <td>Free</td>
            <td>Wedding</td>
            <td>Warm paper tones, an elegant serif and a soft masonry grid.</td>
          </tr>
          <tr>
            <td>Warm Family</td>
            <td>Free</td>
            <td>Family</td>
            <td>Sunny cream backdrop, rounded tiles and a friendly sans — golden-hour warmth.</td>
          </tr>
          <tr>
            <td>After Dark</td>
            <td>Free</td>
            <td>Party</td>
            <td>Near-black canvas with gold accents — made for receptions and nights out.</td>
          </tr>
          <tr>
            <td>Clean Mono</td>
            <td>Free</td>
            <td>Minimal</td>
            <td>Near-white canvas, ink-black type and a tight square grid.</td>
          </tr>
          <tr>
            <td>Classic Wedding</td>
            <td><Tier plan="lite" /></td>
            <td>Wedding</td>
            <td>Split cover, soft masonry grid, serif headlines — timeless.</td>
          </tr>
          <tr>
            <td>Editorial Wedding</td>
            <td><Tier plan="lite" /></td>
            <td>Wedding</td>
            <td>Full-bleed statement cover, justified photo rows, magazine serif — high fashion.</td>
          </tr>
          <tr>
            <td>Newborn Soft</td>
            <td><Tier plan="lite" /></td>
            <td>Family</td>
            <td>Cream linen calm, an airy serif, and first days in a soft three-column masonry.</td>
          </tr>
          <tr>
            <td>Corporate Clean</td>
            <td><Tier plan="lite" /></td>
            <td>Corporate</td>
            <td>Crisp square grid, Inter type, straight to the photos — headshot &amp; event delivery without the frills.</td>
          </tr>
          <tr>
            <td>Luxury</td>
            <td><Tier plan="lite" /></td>
            <td>Editorial</td>
            <td>Champagne gold on near-black — full-bleed hero, curated highlights, Playfair serif.</td>
          </tr>
          <tr>
            <td>Magazine</td>
            <td><Tier plan="lite" /></td>
            <td>Editorial</td>
            <td>Full-bleed fashion cover, cover-story row, cascade spread — Fraunces serif, an actual issue.</td>
          </tr>
          <tr>
            <td>Minimal Mono</td>
            <td><Tier plan="lite" /></td>
            <td>Minimal</td>
            <td>Near-white canvas, ink-black type, tight square grid — the gallery as a quiet exhibition.</td>
          </tr>
          <tr>
            <td>Dark Cinematic</td>
            <td><Tier plan="studio" /></td>
            <td>Wedding</td>
            <td>Night-reception energy — Ken Burns hero, tight dark grid, gold on black.</td>
          </tr>
          <tr>
            <td>Family Warm</td>
            <td><Tier plan="studio" /></td>
            <td>Family</td>
            <td>Sun-washed statement cover, playful collage, big cozy tiles — golden-hour warmth on every scroll.</td>
          </tr>
          <tr>
            <td>Party Energy</td>
            <td><Tier plan="studio" /></td>
            <td>Party</td>
            <td>Neon-dark, tilted photo collage, Bebas headlines — pure party adrenaline.</td>
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
        desktop/phone toggle — the phone side renders the same layout a real phone will — click
        any section to select it; a schema-driven inspector on the right — padding and background
        per section, hero styles and cover picks, slider interval, layout and column density, and
        which photos each section shows: all, one folder, your N-star ratings, or hand-picked
        frames. Client-side view tabs (Gallery / Favorites / Info) are a toggle, not a route.
        Undo/redo run deep (⌘Z / ⇧⌘Z), drafts autosave locally while you work, and a stale-session
        guard compares against the saved design before anything overwrites it.{" "}
        <strong>Save</strong> writes through the same design API the designer uses; text sections
        accept plain formatting only, sanitized before they store.
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
        Previewing is open to every plan, and applying is unlimited within your tier: Free
        applies the five cover-only looks, Lite adds the seven page layouts, Studio adds the
        three collage ones. The builder is Lite and above, collages Studio and above, and Lite
        keeps one saved custom look where Studio and above are unlimited. Templates are starting
        points — apply one per gallery and change it as often as you like. Presets are the looks
        you compose yourself, saved into your{" "}
        <a href="/docs/template-library">template library</a> with a studio default; the designer
        side of all this — covers, layouts, themes, slideshows — lives in{" "}
        <a href="/docs/gallery-design">Gallery design &amp; styles</a>.
      </p>

      <Related slugs={["gallery-design", "gallery-delivery", "template-library", "start-guide"]} />
    </>
  );
}
