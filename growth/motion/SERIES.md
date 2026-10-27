# Not Photography - the series bible

The never-ending concept behind Snap's code-made reels.
Read this before you write an episode spec.

## The premise

Photographers became photographers to take photos.
Most of their week goes to everything else: inbox, dates, contracts, invoices, deposits, links, picks, downloads.
Each episode takes one of those chores and builds it as an absurd little machine the photographer has to operate by hand.
The camera rides the machine, the counters climb, and the one counter that matters stays at zero: **PHOTOS TAKEN 0**.
Then one line names the pain, the machine collapses into one Snap block, and the proof shows the same job done in one place.

The format never runs out, because the chores never run out.
Every chore a photographer complains about is an episode.
Every persona (wedding, newborn, family, event, boudoir, headshot, real estate) re-skins an episode.
Every season (wedding season, holiday minis, back to school) gives a reason to run one again.

## The look

The visual reference is BUCK's "airbnb it." campaign for Airbnb: open close on a small human moment, pull back to reveal the whole place as a tiny diorama on a warm seamless backdrop, then a verb tagline in a bold wordmark over the diorama.
We keep the structure and the feeling, never the content: our diorama is the photographer's admin machine, and our verb is **Snap it.**

- **Full colour (default from E002).** `theme: "sunny"` in the machine scene: saturated clay materials (coral, teal, mustard, leaf green, pink, sky blue, navy), potted plants on the table, puffy clouds, and a sky that runs from morning through sunset to twilight while the chore drags on. The slam accent is sunshine yellow. Set `sky: true` on the checklist and cta scenes so the Snap world is the next bright morning, with clouds. Never desaturate: the founder asked for colourful, not dull.
- **Two worlds.** The chore world runs through the day into night. The Snap world is daylight, with the brand lavender (`#5e6ad2`) on the block, the ticks and the coin. E001 uses the older `dusk` theme (warm plum, quieter materials) with a plain lavender Snap world.
- **Miniature, tactile, soft.** Solid parts with soft contact shadows and quiet edges (`TONE.dusk` in `engine/iso.js`), built with the anatomy skill's craft rules (`.claude/skills/anatomy`): many small parts that sit on each other, one lit accent.
- **A tiny person gives it scale.** The photographer (`engine/figure.js`) walks the line beside the client card, camera hanging unused, and slumps on the slam.
- **Calm camera.** One follow move, one pull-back reveal, one collapse. No whip pans.

## The signature (keep these in every episode)

1. Kicker at the top: `NOT PHOTOGRAPHY  ·  EP NN`.
2. The counter row, ending with **PHOTOS TAKEN 0** in red.
3. The dusk diorama: one station per step on a tabletop, the tiny photographer walking it.
4. The slam: a two-line sentence ending in *photography.* in red, on a camera pull-back that shows the whole diorama with every lamp blinking.
5. The collapse: the stations slide together and shrink, a lavender disc opens, one Snap block rises, and **Snap it.** lands above it as a wordmark.
6. The proof card on lavender: one client, the same steps, each ticked.
7. The end card: the spinning Snap coin, **Snap it.**, the offer, `snaphq.app`.

## The ad anatomy (timings for a 20-26 s reel)

| Beat | Time | Job | Rule |
|---|---|---|---|
| Hook | 0-2.3 s | Stop the thumb | Name the job and make it sound small: "Booking ONE wedding client". Five words a line at most. |
| Pain | 2.3-10 s | Make them nod | One station per step, 1.1-1.4 s each, a caption under each in their words. 4-7 stations. |
| Reveal | 10-11 s | Show the scale | Pull back to the whole machine. Lamps blink: nothing is resolved. |
| Slam | 11-12.5 s | Name the feeling | "None of that is *photography.*" or a variant. Boom, then near-silence. |
| Turn | 12.5-14.3 s | One move | The machine collapses into one block under the wordmark **Snap it.**, with "All of it, in *one place.*" |
| Proof | 14.3-20.5 s | Make it believable | The same steps, ticked one by one, each a real Snap feature backed by a claim. |
| Offer | 20.5-24 s | Make it easy | Coin, what Snap is, "*0%* commission. *Free* to start.", `snaphq.app`. |

Sound off is the default in the feed, so every beat must read without audio.
Sound on gets the synthesised score: a ticking clock that speeds up through the pain, a boom on the slam, a bloom on the turn, chimes on each tick, a final hit on the coin.

## Copy rules

- Write captions the way a photographer would say them to another photographer: "Chase the deposit", not "Payment collection workflows".
- No em dashes anywhere (founder rule). `render.mjs check` fails on one.
- Every price, percentage, plan word or limit on screen or in the caption is a claim with a source file in `apps/snap` (growth/AGENTS.md rule 6).
- The caption ends with the honest limit line ("It is not magic: ..."), the way the earlier Snap reels do.
- Never name a competitor on screen or in the caption.
- Stations show generic tools ("EMAIL", "SCHEDULER"), never a real product's name or logo.

## Episode backlog

Status: `made` has a spec, `ready` only needs a spec (every station kind exists), `stations` needs new station kinds first.
Check every claim against the code again when you make an episode: plans change.

| Ep | Title | Chore (hook) | Stations | Proof rows (Snap) | Claim sources to start from | Status |
|---|---|---|---|---|---|---|
| E001 | The Booking Machine | Booking ONE wedding client | inbox, calendar, contract, invoice, payment, gallery | Booked, contract signed, deposit paid, gallery delivered | `lib/plans-data.ts`, `lib/connect.ts`, `lib/contracts.ts`, `lib/invoices.ts` | made |
| E002 | The Deposit Chaser | Getting ONE deposit paid | invoice, inbox, reminders, phone, payment | Invoice sent with a pay link, paid into your own Stripe, marked paid on its own, lands on the client's inbox thread | `lib/invoices.ts`, `lib/connect.ts` | made |
| E003 | The Gallery Resender | Sending ONE gallery link | gallery, inbox, gallery, inbox, `lock` | Link with expiry, new link replaces the old one, access code by email | `growth/storyboards/PP-003.meta.json` | stations |
| E004 | The Picks Collector | Getting ONE client's album picks | gallery, inbox, `screenshot`, `spreadsheet`, inbox | Selection mode, client counter, picks land on the project | `growth/storyboards/PP-002.meta.json` | stations |
| E005 | The Signature Hunt | Getting ONE contract signed | contract, inbox, `printer`, `scanner`, inbox | Template, merge fields, signed in the browser, PDF archived | `lib/contracts.ts`, `lib/merge.ts` | stations |
| E006 | The Date Juggler | Booking ONE mini session | inbox, calendar, calendar, inbox, `clock` | Booking page with live openings, client timezone, reminder emails | `growth/storyboards/PP-005.meta.json` | stations |
| E007 | The Download Helpdesk | Helping ONE client download | gallery, inbox, `phone`, `zip`, inbox | One-click Download all, any gallery size | `lib/tier-cards.ts` (Free) | stations |
| E008 | The Inbox Archaeologist | Finding ONE client's thread | inbox, `dm`, `sms`, inbox, `notebook` | Unified inbox: every conversation and event in one place, free | `lib/tier-cards.ts` (Free) | stations |
| E009 | The Watermark Factory | Protecting ONE sneak peek | gallery, `stamp`, `export`, gallery | Watermarks and deterrents, sneak peeks, download approvals | `lib/tier-cards.ts` (Studio) | stations |
| E010 | The Print Order Spreadsheet | Selling ONE print | inbox, `spreadsheet`, invoice, payment, `parcel` | Online store from the gallery, 0% commission | `lib/tier-cards.ts` (Lite) | stations |
| E011 | The Questionnaire Pile | Prepping ONE wedding day | inbox, `form`, `spreadsheet`, inbox | Forms and questionnaires on the project | `lib/tier-cards.ts`, `lib/plans-data.ts` | stations |
| E012 | The Hard Drive Shuffle | Storing ONE wedding's RAWs | `drive`, `drive`, `drive`, gallery | RAW Vault, storage pooled across studios | `lib/tier-cards.ts` (Lite) | stations |
| E013 | The Two-Business Juggle | Running TWO studios | inbox, invoice, inbox, invoice | 3 studios, one bill | `lib/tier-cards.ts` (Lite) | stations |
| E014 | The Commission Leak | Getting paid for ONE shoot | invoice, payment, `fee`, payment | 0% commission, your own Stripe, every plan | `lib/connect.ts` | stations |

Add rows as the researcher validates new pain points (`growth/AGENTS.md` loop step 1).
A validated ledger record (PP-###) can become an episode: put its id in `pain.ledger` and reuse its evidence.

## Variants (how one episode becomes several ads)

- **Persona swap**: change the hook noun and the client card ("Booking ONE newborn session", "Emma's newborn session").
- **Hook swap**: question ("How many apps does ONE wedding take?"), number ("6 apps. 23 emails. 0 photos."), POV ("POV: it's 11pm and you're still booking").
- **Length cut**: a 12 s cut is hook, 3 stations, slam, offer. Set `follow.per` to 1.0 and drop the proof scene.
- **Platform**: the same spec renders for Reels, Facebook Reels and Stories (all 9:16). Keep text inside `SAFE` in `engine/runtime.js`.

Test two hooks per episode as separate ads before making the next episode; the analyst feeds results back here.
