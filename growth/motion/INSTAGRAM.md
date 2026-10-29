# Snap on Instagram - the reel playbook

How Snap keeps making Airbnb-grade reels that sit in the existing @snaphq.app grid as if they were always there, and never run out of ideas.
Read `SERIES.md` for the original "Snap it." idea and `hybrid/` for how a reel is made.

## Where the grid is today

Seventeen posts, all from `marketing/scripts/poster.mjs`, one visual system:

- lavender to white gradient (`#f1f1fb`), ink `#0f1011`, accent periwinkle `#5e6ad2` (`marketing/brands/snap.json`)
- an Inter headline of two or three lines with one *italic accent word* ("most *annoying*", "in *one* inbox", "you *earn*")
- one frosted glass hero object per post, each standing for a feature: envelope = inbox, stacked frames = galleries, light ribbon = invoices, glass orb = getting paid, glass ring = one place, light pyramid = downloads
- the Snap mark top left, a kicker pill top right, "Start free at snaphq.app" black pill bottom left
- carousels of real app screens between them

That system is the brand now. Reels must look like it, not like a separate campaign.

## The idea: the glass studio comes to life

Airbnb's films put tiny people into a magical miniature version of the product's world.
Our world already exists: the lavender glass studio from the posters.
So the reels put **tiny, real-looking figurines** (the recurring Snap photographer and her clients) **into that glass studio**, working around the same glass objects the posters show.

A static post shows the glass envelope. The reel shows the photographer standing at it while her clients' cards float out of it.
Same object, same light, same palette: the grid stays seamless, and the reels feel like the posters waking up.

The floating-island worlds (S01) stay as the flagship register, used less often (see "Registers").

Proof: G01 (`episodes/G01-one-inbox`). The top third stays empty for the headline, exactly like the posters.

## Grid rules (every reel)

1. **The cover is a poster.** Frame 0 of every reel is drawn in the poster layout: kicker pill, headline with one italic accent word, the hero object in the lower middle, the black pill. A thumb-stopping still on the grid, a calm first frame in the feed.
2. **Design for the 3:4 grid crop.** The profile grid shows a 3:4 crop (1080x1440) from the centre of the 9:16 reel, so y 240 to 1680 must hold the headline, the object and the pill. Nothing important above 240 or below 1680.
3. **Same tokens as the posters.** Colours, font and pill come from `marketing/brands/snap.json`, never typed into a spec. If the brand file changes, posters and reels change together.
4. **One feature per reel, one glass object per feature.** The object table below is the vocabulary; add to it, never swap meanings.
5. **The model draws pictures, code draws words.** No text in generated images. Every word, number, inbox card and price is code, checked by `render.mjs check` against `apps/snap`.
6. **Same people.** The photographer and recurring clients come from `hybrid/sheets.json` with numeric locks, pasted verbatim into every prompt (Kaye rule 3).
7. Humans post (growth/AGENTS.md rule 1). Turn on Instagram's AI label for every reel with generated footage.

### The object vocabulary

| Feature (real, in `apps/snap`) | Glass object | Snap moment on screen |
|---|---|---|
| Inbox and CRM | frosted envelope | New inquiry, New booking cards |
| Booking page | glass calendar tiles, a glass door | New booking - {client} |
| Contracts and e-signature | a glass sheet with a light signature line | Contract signed - {title} |
| Invoices and payments into your own Stripe | the light ribbon, a glass coin | Invoice {number} paid |
| Client galleries, favourites, downloads | stacked glass frames, the light pyramid | Client opened their gallery |
| One place for everything | the glass ring | the inbox filling up |
| Free plan, 0% commission | the glass orb | the offer line, on the cover only |

## Registers

| Register | What it is | Share of reels | Cost per reel |
|---|---|---|---|
| **Glass Studio** (signature) | Figurines and one glass object in the lavender studio, 6 to 10 s, one Snap moment | 3 of 4 | 1 keyframe, 1 or 2 Wan clips: about 15 min of GPU |
| **Out Here** (flagship) | Floating miniature worlds through a day or a season, 20 to 30 s, the E003 format | 1 a month | 4 to 6 clips plus moves: about 45 min of GPU |
| **Loop** (filler) | 3 to 5 s seamless loop of a glass object, no people, the poster's object breathing | as needed | 1 clip, first frame = last frame |

## Formats (so it is never "a world" every time)

Pick a format, a feature and a shoot type. Each line is a reel.

1. **Snap it. (the wish)** - The photographer at work says what she wishes ("I wish they'd just book"). A puff of lavender light, the glass object appears, the card lands. After Airbnb Services.
2. **Before / after in one take** - the same tiny desk, buried in paper envelopes and sticky notes; the camera pushes in, the clutter folds into one glass envelope. Hook: "Your inbox, *before* Snap."
3. **The tiny shoot** - a real session at figurine scale on top of the glass object: a newborn on a glass frame, a wedding on the glass ring, a dog shoot on the orb. The object is the stage.
4. **POV of the client** - a tiny client on her sofa (a glass sofa), opens the gallery on a glass phone, the frames rise around her. Card: Client opened their gallery.
5. **One question** - the poster question format in motion ("What's your most *annoying* admin task?"): the glass question mark turns, tiny photographers stand on it holding signs that the code writes. Built for comments.
6. **Out Here** - the floating-island day (E003) and its season and wedding variants (E004 to E006 in SERIES.md).
7. **The loop** - the poster's object breathing for 4 s, cut so it loops. For days with no new reel.

## The concept engine

A concept is four picks. With 7 features x 7 formats x 10 shoot types x 3 hooks there are well over a thousand reels before anything repeats.

- **Feature**: from the object vocabulary (only features `apps/snap` really has).
- **Format**: from the list above.
- **Shoot type**: newborn, family, wedding, elopement, pet, headshots, brand, real estate, events, graduation.
- **Hook**: question ("Still chasing *invoices*?"), aspiration ("Spend the day *out here*."), number ("5 galleries. *Free*.").

Rules for picking: never the same feature twice in a row; rotate shoot types so every photographer sees themselves within a month; match the season (fall families in October, holiday minis in November, weddings in spring).
Then write the director's brief in plain language (Kaye rule 2) and let the agent turn it into sheets, keyframe and clip prompts.

### First twelve

| # | Format | Feature | Shoot | Hook | Snap moment |
|---|---|---|---|---|---|
| G01 | Tiny shoot | Inbox | wedding | Every inquiry in *one* inbox. | New inquiry - Priya & Sam |
| G02 | Wish | Invoices | family | I wish they'd just *pay*. | Invoice INV-0042 paid |
| G03 | Client POV | Galleries | newborn | Galleries clients actually *love*. | Client opened their gallery |
| G04 | Before / after | Inbox | events | Your inbox, *before* Snap. | New booking - Maya Chen |
| G05 | Tiny shoot | Contracts | elopement | Contracts clients can *sign* online. | Contract signed - Elopement |
| G06 | Question | (comments) | all | What's your most *annoying* admin task? | none |
| G07 | Tiny shoot | Booking page | headshots | Let clients book *themselves*. | New booking - Jordan Lee |
| G08 | Loop | Getting paid | none | Keep what you *earn*. | none |
| G09 | Wish | Contracts | wedding | I wish they'd just *sign*. | Contract signed - Wedding |
| G10 | Client POV | Downloads | family | One click. *Every* photo. | Client opened their gallery |
| G11 | Out Here | all four | day | Spend the day *out here*. | four cards (E003) |
| G12 | Tiny shoot | Galleries | pet | Five galleries, *free*. | Client opened their gallery |
| S03 (made) | Out Here | Galleries | engagement | Shot today. *Delivered* tonight. | Gallery delivered - Priya & Sam; Client opened their gallery for the first time |

Made so far (episode folder with a package): G01, G02, G11 (as S01 A Day Out Here), and S02 The Season (Out Here, E005 in SERIES.md: spring, summer, fall and winter worlds; New inquiry - Ana & Leo, New booking - Hannah Reyes, Contract signed - Cabin session, Invoice INV-0058 paid; hook "Spend the year *out here.*").

Names, numbers and plan limits in cards and hooks must pass `render.mjs check` against `apps/snap` before production; adjust the line, not the code, if a claim does not hold.

## Posting rhythm

Today: 2 posts a week on the Snap page (`marketing/CALENDAR.md`). Move to 3, read as rows of three on the grid:

| Week | Tue | Thu | Sat |
|---|---|---|---|
| A | Glass Studio reel | poster | app carousel |
| B | poster | Glass Studio reel | Loop or question reel |
| monthly | Out Here flagship replaces one reel | | |

Every reel's cover sits next to posters that share its feature, so a row reads like one thought (envelope reel, inbox poster, inbox carousel).
Judge by saves, shares, profile visits and signups (UTM on the bio link), not views. The growth analyst feeds winners back here: double down on the format, not the topic.

## Making one

The procedure is the `growth-motion-reel` skill (`.claude/skills/growth-motion-reel/SKILL.md`); the `growth-motion` agent runs it.
In short, for either register:

1. `hybrid/preflight.mjs`: this machine has ComfyUI, the models, ffmpeg and Playwright.
2. An episode folder copied from G02 (Glass Studio) or S01 (Out Here): `brief.md`, one `<shot>.keyframe.txt` per shot, `clips.json`, `episode.json`.
3. `hybrid/keyframes.mjs` for candidates, look, `--pick`.
4. `hybrid/run-clips.mjs --draft`, look, then `hybrid/run-clips.mjs` to keep at 720x1280. Moves fly from the frame where the previous shot is cut.
5. `hybrid/frames.mjs`, `hybrid/spec.mjs`, `render.mjs check`, `stills`, look, `render`, `package`.

For story reels, chain the cards to the story (the card at one world is often the client of the next) and reuse people across reels: Priya and Sam inquire in G01 and marry in S01.

## Built

- `overlays.poster`: frame 0 in the poster layout from `marketing/brands/snap.json` (G01).
- The glass studio and Out Here location sheets in `hybrid/sheets.json`.
- The glass end card backdrop for the phone scene.

## Still to build

