# Snap it. - the series bible

The never-ending concept behind Snap's code-made reels.
Read this before you write an episode spec.

## The idea

Airbnb made "airbnb it." a verb: whatever the trip, there is a place for it.
We make **Snap it.** a verb for photographers: whatever the shoot, your clients book, sign and pay in Snap while you are out there shooting.

The films are not about admin.
They are about the work photographers love, in places they love doing it: a newborn studio at 8, a family in fall leaves at 1, a lakeside wedding at golden hour, a party under string lights at night.
The business runs alongside, in small moments: a Snap inbox card drops in after the shutter fires ("New booking", "Contract signed", "Invoice paid", "Client opened their gallery").
It ends on the Snap app, the way the Airbnb films end on theirs.

It never runs out, because there are endless places and kinds of shoot, and endless moments a client does something in Snap.

## What we took from the Airbnb films

The founder shared eight Airbnb spots ("airbnb it." by BUCK, Experiences, Services, the travel film).
What makes them work, and what we copy (the structure and feeling, never the content):

1. **Miniature worlds.** Every place is a tiny, tactile diorama: a cottage on a floating island, a cutaway room, a city seen as a model. Soft clay materials, real soft light, tilt-shift blur.
2. **A journey, not a list.** One continuous camera move travels from world to world (island to beach to city to night). No hard cuts.
3. **Many environments.** Mountains, snow, beach, autumn, city nights. Colour changes with the place and the time of day.
4. **Joyful people doing the thing.** Tiny characters cooking, surfing, dancing, practising yoga. Never people suffering.
5. **A little magic.** A puff of dust and a chef appears; the product arrives as a delight, not a feature list.
6. **The app as the payoff.** The last beat is the real app UI on a phone.

## Formats (pick one per episode)

| Format | Shape | Example |
|---|---|---|
| **A Day Out Here** | One photographer's day across 3-5 island worlds, morning to night. An inbox card after each shutter. Ends on the phone with the day's inbox. | E003 |
| **Wherever You Shoot** | One kind of event (weddings) across very different worlds: a beach, a mountain elopement in snow, a city rooftop, a barn in fall. Same Snap moment each time. | weddings, families, newborns |
| **The Season** | A year as four worlds: spring blossoms, summer beach, fall leaves, winter cabin. Pair with seasonal pushes (holiday minis, wedding season). | E005 |
| **Snap it. (the wish)** | The Services film: the photographer wishes something would just happen ("I wish they'd just pay"), a puff of lavender dust, and the Snap moment appears in the world. | E004 |
| **The Studio** | A single cutaway studio through a day: clients come and go, the sky outside the window changes, a card per visit. | headshots, newborns |

## The look

- **Real 3D, built in code.** `engine/scenes/world.js` with three.js: soft clay materials, PCF soft shadows, ACES tone mapping, a sky gradient and fog that follow the time of day, a tilt-shift pass for the miniature look.
- **Floating islands** (`engine/world/kit.js` `island()`) with grass, soil and a craggy underside, drifting clouds below, stars at night.
- **Full colour, never dull.** The founder asked for it twice. Saturated but soft: coral, teal, mustard, leaf green, blossom pink, sky blue, autumn orange. Night is indigo and violet with warm bulbs, never grey.
- **Time of day carries the story.** Sky presets `morning`, `afternoon`, `golden`, `night` in `world.js`; cross-fade between them as the camera travels.
- **Tiny joyful people** (`person()` and `pose` in `kit.js`): shoot, stand, sit, hold, dance, jump, wave. The photographer always has the camera up.
- **Moments, not machines.** The old "Not Photography" assembly line (E001, E002) is retired: the founder is done with it.

## The signature (keep these in every episode)

1. A hook over a wide shot of the worlds: short, aspirational ("Spend the day *out here.*").
2. A time chip at the bottom of each world: `8:00 AM  Newborn session`.
3. The shutter: a flash on the photographer's camera, a soft white pop on screen, a real shutter sound.
4. A **Snap inbox card** dropping in after the shutter, with the exact wording of a real Snap inbox event.
5. A pull-back over every world, with the line "Your clients book, sign and pay in *Snap.*" (or the episode's variant).
6. The end card: the Snap app on a phone with the day's inbox filling in, then **Snap it.**, "*0%* commission. *Free* to start.", `snaphq.app`.

## Inbox cards must be real

Each card mirrors an event Snap really records in its inbox (`apps/snap`, search `eventType:`).
These exist today:

| Event | Inbox wording in code | Source |
|---|---|---|
| `lead.created` | New inquiry - {name} | `lib/repos/leads.ts` |
| `booking.created` | New booking - {client} | `lib/repos/bookings.ts` |
| `booking.rescheduled` | (rescheduled booking) | `lib/repos/bookings.ts` |
| `contract.sent` | (contract sent) | `lib/contracts.ts` |
| `contract.signed` | Contract signed - {title} | `lib/contracts.ts` |
| `invoice.paid` | Invoice {number} paid | `lib/invoices.ts` |
| `gallery.delivered` | (gallery delivered) | search `gallery.delivered` |
| `gallery.first_view` | Client opened their gallery for the first time | `lib/shares/gallery-auth.ts` |
| `upload.submitted` | (client upload) | search `upload.submitted` |

Use a plain dash where the code has an em dash (founder rule).
Never invent an event: no automatic reminders, no phone push notifications, no "Snap did it for you".
The honest caption line says what the photographer still does ("you still send the contract, the invoice and the gallery").

## The ad anatomy (timings for a 24-30 s reel)

| Beat | Time | Job | Rule |
|---|---|---|---|
| Hook | 0-2.4 s | Stop the thumb | Wide shot of the floating worlds, two short lines. |
| Worlds | 2.4-21 s | Make them want it | 3-5 worlds, 4.5-5 s each: arrive (1.2 s arcing move), the moment, the shutter, the inbox card. |
| Pull-back | 21-23.5 s | Show the whole day | Every world in one frame at night, the summary line. |
| App | 23.5-28 s | Make it real | Phone with the day's inbox, **Snap it.**, offer, URL. |

Sound off is the default, so every beat reads without audio.
Sound on: a warm pad and a soft pulse, a whoosh on each move, a real shutter on each flash, a chime per card, a bloom on the pull-back, a hit on **Snap it.**

## Copy rules

- Write the way photographers talk to each other.
- No em dashes anywhere (founder rule). `render.mjs check` fails on one.
- Every price, percentage, plan word or limit is a claim with a source file in `apps/snap` (growth/AGENTS.md rule 6).
- Captions end with the honest limit line ("It is not magic: ...").
- Never name a competitor.

## Episode backlog

Status: `made` has a spec; `ready` needs only a spec (every island kind exists); `worlds` needs new island builders in `engine/world/islands.js` first.

| Ep | Title | Format | Worlds | Inbox cards | Status |
|---|---|---|---|---|---|
| E001 | The Booking Machine | (retired assembly line) | - | - | made |
| E002 | The Deposit Chaser | (retired assembly line) | - | - | made |
| E003 | A Day Out Here | A Day Out Here | studio, fallPark, lakeWedding, nightParty | New booking, Contract signed, Invoice paid, Gallery first view | made |
| E004 | I Wish They'd Just Pay | Snap it. (the wish) | lakeWedding, `beach`, `mountainElopement` | Invoice paid x3, a puff of lavender dust each time | worlds |
| E005 | The Season | The Season | `springBlossom`, `summerBeach`, fallPark, `winterCabin` | New inquiry, New booking, Contract signed, Invoice paid | worlds |
| E006 | Wherever You Say I Do | Wherever You Shoot | `beach`, `mountainElopement`, `cityRooftop`, `barnFall` | Contract signed at each | worlds |
| E007 | The Mini Session Marathon | The Studio | `holidayMinis` (a studio with a tree, a queue of families) | New booking x5 in a row | worlds |
| E008 | Delivered | A Day Out Here | studio, `editingDesk` (night, warm lamp), `livingRoom` (the client on a sofa) | Gallery delivered, Client opened their gallery | worlds |
| E009 | Graduation Day | Wherever You Shoot | `campusLawn`, `cityRooftop` | New booking, Invoice paid | worlds |
| E010 | Brand Shoot | The Studio | `cafe`, `cityRooftop` | New inquiry, Contract signed | worlds |

New island ideas, each a small builder on the kit: beach with surf and parasols, a snowy pine cabin with falling snow (`fall({ shape: "snow" })`), a mountain ledge, a city rooftop at dusk with string lights, a barn with hay bales in fall, a cherry-blossom park, a cafe cutaway, a campus lawn, a living room cutaway, a night editing desk with a glowing monitor.

## Variants (how one episode becomes several ads)

- **Persona swap**: the same journey with newborn, family, or event worlds.
- **Hook swap**: aspiration ("Spend the day *out here.*"), question ("Where did you shoot today?"), number ("4 shoots. 1 inbox.").
- **Length cut**: two worlds plus the app is a 15 s cut.
- **Platform**: the same spec renders for Reels, Facebook Reels and Stories (all 9:16). Keep text inside `SAFE` in `engine/runtime.js`.

Test two hooks per episode as separate ads before making the next one; the analyst feeds results back here.
