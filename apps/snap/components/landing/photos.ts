/**
 * Photography registry for the cinematic landing.
 * Each entry: public path + the alt text it deserves. Filenames in
 * /public/imgs/landing are stable; roles live here, not in component code,
 * so art direction changes never touch animation code.
 */
export type Photo = { src: string; alt: string; /** object-position for tight crops (mobile) */ position?: string };

const p = (src: string, alt: string, position?: string): Photo => ({
  src: `/imgs/landing/${src}`,
  alt,
  ...(position ? { position } : {}),
});

export const HERO_FRAMES: Photo[] = [
  p("scenery-peak.jpg", "Alpine peaks at sunset rising over a sea of clouds"),
  p("scenery-valley.jpg", "Green mountain valley at sunrise, mist rolling over ridges"),
  p("scenery-forest.jpg", "Sunlight falling through tall forest trees onto a path"),
  p("scenery-meadow.jpg", "Golden wheat field under the last light of day"),
];

export const WILD_FRAMES: Photo[] = [
  p("fox.jpg", "A red fox in soft golden light looking into the lens", "22% center"),
  p("deer.jpg", "A whitetail buck in morning backlight"),
  p("bird.jpg", "A kingfisher perched on a branch, sharp against soft bokeh"),
  p("butterfly.jpg", "A macaw portrait with vivid blue and yellow plumage"),
  p("flower-macro.jpg", "Wild orange poppies at arm's length"),
  p("dew.jpg", "Rain drops scattered across glass, monochrome"),
];

export const TOWN_FRAME: Photo = p(
  "street-dusk.jpg",
  "A busy city street dense with taxis, people and glass towers",
);

export const WEDDING_FRAMES: Photo[] = [
  p("wedding-veil.jpg", "A wedding dress and veil hanging in morning light"),
  p("wedding-couple.jpg", "Bride and groom holding hands on the lawn"),
  p("wedding-bouquet.jpg", "The couple backlit by sun, bouquet in front"),
  p("wedding-rings.jpg", "A diamond engagement ring in macro on dark silk"),
  p("wedding-sparkler.jpg", "The first kiss under thrown petals"),
  p("wedding-table.jpg", "The reception table set with wildflowers"),
];

export const FAMILY_FRAMES: Photo[] = [
  p("maternity.jpg", "Hands forming a heart over a baby bump"),
  p("newborn.jpg", "A sleeping newborn, cheek on white blankets"),
  p("newborn-alt.jpg", "Tiny newborn feet tucked in a towel"),
  p("baby-mother.jpg", "A toddler peering through her first toy camera"),
  p("baby-feet.jpg", "A one-year-old floating in a pool ring, mid-laugh"),
  p("family.jpg", "A family walking the shoreline at dusk"),
];

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
