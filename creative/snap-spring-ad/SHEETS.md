# WEBC-109 — Snap Spring Ad: Sheet Factory Output

Title (provisional, per chief-of-staff): **"Some Springs Only Happen Once"**
All assets $0 — local flux1-schnell-fp8 on ComfyUI (172.25.192.1:8188). No paid API touched.

## Approved sheet set (reference locks for every downstream generation)

| Asset | Take | Notes from QC |
|---|---|---|
| MOTHER | `sheets/sheet_mother_01.png` | Cardigan/skirt/sneakers/flower-clip ✓ |
| FATHER | `sheets/sheet_father_03.png` | Empty strap ✓ (strap carries a small leather pouch — acceptable) |
| DAUGHTER | `sheets/sheet_daughter_02.png` | Pigtails/tulle/tights/mary-janes ✓; gap-tooth not confirmed at render res |
| SON | `sheets/sheet_son_01.png` | Dungarees/rabbit ✓ |
| PHOTOGRAPHER | `sheets/sheet_photographer_03.png` | Bun/glasses/gilet/camera ✓; face reads slightly older than the 41y lock — correct via reference at scene stage |
| L1 HOME (dawn) | `sheets/loc_home_dawn_01.png` | Golden window light, dust, coat hooks ✓ |
| L2 ORCHARD (day) | `sheets/loc_orchard_day_01.png` | Blossom rows, tulips, drifting petals ✓ |
| L3 DESK (evening) | `sheets/loc_desk_evening_01.png` | Lamp/monitor/tea steam/blue dusk ✓ |

Superseded takes kept for provenance: `sheet_father_01`, `sheet_father_02` (camera on strap),
`sheet_daughter_01` (no pigtails), `sheet_photographer_01` (read 60+), `sheet_photographer_02`.

## Storyboard drafts (16:9, founder review) — `storyboards/`

sb_01_anticipation · sb_02_booked_arrived · sb_03_the_world · sb_04_lineup ·
sb_05_the_shots · sb_06_golden_hour · sb_07_the_cull_v2 · sb_09_endcard

QC notes: sb_02 shows the family meeting the car (beat drift — scene 2 in the cut is
phone ping → car arriving, so acceptable); sb_09 includes the family admiring the
framed photo (arguably stronger than an empty room — founder's call). Scene 8 is
**never generated**: it is real Snap UI via Gwen's recording pipeline (PP-003 masking rule).

## Known drift to fix at scene-generation stage

- Photographer's age lock (41) reads ~45 — pin with the approved sheet as reference.
- Daughter's gap-tooth signature not confirmed — re-lock at character-reference stage.
- sb_07_v2 monitor shows a generic OS UI with a fruit logo — final scene 7 must use
  neutral culling software or the Snap web gallery, no third-party brand marks.

## Pipeline

Harness: `gen_sheets.py` (sheets), `gen_storyboards.py` (frames), `reroll_pass1.py` /
`reroll_pass2.py` / `reroll_sb07.py` (QC fixes). Ledger: `ledger.md` (one line per asset:
asset | settings | wall_s | file).

## Next (blocked on founder spend ≈ $50 — NOT approved yet, nothing spent)

Veo 3.1 Fast i2v drafts from these sheets → winner upscale at Standard. Meanwhile Gwen
can start the scene-8 Snap UI recording and the Remotion assembly scaffolding ($0).
