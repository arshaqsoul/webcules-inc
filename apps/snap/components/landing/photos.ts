/**
 * Photography registry for the landing page.
 * Each entry: public path + the alt text it deserves. Filenames in
 * /public/imgs/landing are stable; roles live here, not in component code,
 * so art direction changes never touch animation code.
 */
export type Photo = { src: string; alt: string; /** object-position for tight crops (mobile) */ position?: string };

const p = (src: string, alt: string, position?: string): Photo => ({
  src: `/imgs/landing/t/${src}`,
  alt,
  ...(position ? { position } : {}),
});

export const MARQUEE_A: Photo[] = [
  p("scenery-peak.jpg", "Alpine peaks over clouds at sunset"),
  p("fox.jpg", "Red fox portrait"),
  p("wedding-sparkler.jpg", "First kiss under petals"),
  p("newborn.jpg", "Sleeping newborn"),
  p("bird.jpg", "Kingfisher on a perch"),
  p("scenery-lake.jpg", "Still lake and dock at dawn"),
  p("portrait-woman.jpg", "Laughing portrait in red"),
  p("wedding-rings.jpg", "Ring macro"),
  p("aurora.jpg", "Aurora borealis over a pine line"),
  p("baby-feet.jpg", "Pool-ring one-year-old"),
  p("flower-macro.jpg", "Wild poppies"),
  p("street-dusk.jpg", "City street in motion"),
];

export const MARQUEE_B: Photo[] = [
  p("deer.jpg", "Whitetail buck in backlight"),
  p("wedding-bouquet.jpg", "Backlit couple with bouquet"),
  p("baby-mother.jpg", "Toddler with her first camera"),
  p("dog.jpg", "Beagle mid-grin"),
  p("scenery-sunbeam.jpg", "Hiker above a misty valley"),
  p("family.jpg", "Family silhouettes at dusk"),
  p("portrait-man.jpg", "Studio headshot"),
  p("wedding-veil.jpg", "The dress, first light"),
  p("campfire.jpg", "Campfire circle at night"),
  p("butterfly.jpg", "Macaw portrait"),
  p("newborn-alt.jpg", "Newborn feet"),
  p("baby-shower.jpg", "Portrait, mid-laugh"),
  p("adventure-couple.jpg", "Kayaks on turquoise water, aerial"),
];
