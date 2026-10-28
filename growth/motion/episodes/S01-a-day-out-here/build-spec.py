# Builds spec.json from clips.json and the frame counts that hybrid/frames.mjs wrote.
# python3 growth/motion/episodes/S01-a-day-out-here/build-spec.py   (run from growth/motion)
import json
EP = "episodes/S01-a-day-out-here"
clips = json.load(open(f"{EP}/clips.json"))
counts = json.load(open(f"{clips['dir']}/frames/counts.json"))
e3 = json.load(open("episodes/E003-a-day-out-here/spec.json"))
LOGO = "marketing/brands/snap-logo.png"
moments = {
    "studio": (["8:00 AM", "Newborn session"], {"title": "New booking - Maya Chen", "sub": "from your booking page"}),
    "fallpark": (["1:00 PM", "Fall family photos"], {"title": "Contract signed - Lakeside wedding", "sub": "signed in their browser"}),
    "lake": (["5:30 PM", "Priya & Sam's wedding"], {"title": "Invoice INV-0042 paid", "sub": "into your own Stripe"}),
    "party": (["9:00 PM", "Birthday party"], {"title": "Client opened their gallery", "sub": "for the first time"}),
}
scenes, t = [], 0.0
for i, s in enumerate(clips["shots"]):
    n = counts[s["name"]]
    dur = round(n / 30, 3)
    p = {"frames": f"growth/motion/{clips['dir']}/frames/{s['name']}/%04d.jpg", "count": n, "fps": 30, "pad": False}
    if s.get("move"):
        p["whoosh"] = True
    if s["name"] == "open":
        p.update(lines={"lines": ["Spend the day", "*out here.*"], "at": 0.25, "out": dur - 0.35, "y": 470, "size": 108})
        del p["pad"]
    if s["name"] in moments:
        chip, toast = moments[s["name"]]
        p.update(chip=chip, flash=1.5, cardAt=1.85, toast=toast, logo=LOGO, index=list(moments).index(s["name"]))
    if s["name"] == "finale":
        p.update(lines={"lines": ["Your clients book, sign", "and pay in *Snap.*"], "at": 0.3, "y": 470, "size": 76})
    scenes.append({"type": "clip", "at": round(t, 3), "dur": dur, "props": p})
    t += dur
phone = json.loads(json.dumps(e3["scenes"][1]))
phone["at"] = round(t, 3)
pp = phone["props"]
pp["backdrop"] = "growth/motion/assets/endcard/glass.jpg"
pp["rows"] = [
    {"title": "New booking - Maya Chen", "sub": "Newborn session", "time": "8:04 AM", "color": "#ffb000", "at": 0.5},
    {"title": "Contract signed - Lakeside wedding", "sub": "Priya & Sam", "time": "1:12 PM", "color": "#f26a4d", "at": 0.7},
    {"title": "Invoice INV-0042 paid", "sub": "Into your own Stripe", "time": "5:41 PM", "color": "#ff6fa0", "at": 0.9},
    {"title": "Client opened their gallery", "sub": "For the first time", "time": "9:20 PM", "color": "#7a5cff", "at": 1.1},
]
scenes.append(phone)
total = round(t + phone["dur"], 2)
scenes[0]["props"]["padFor"] = total
starts = {s["props"]["frames"].split("/")[-2]: s["at"] for s in scenes[:-1]}
spec = {
    "id": "S01", "title": "A Day Out Here", "series": "Snap it. - Out Here", "brand": "snap", "fps": 30,
    "duration": total, "cover": 1.2,
    "stills": [0.6, 1.5] + [round(starts[k] + 2.3, 2) for k in moments] + [round(starts["finale"] + 1.6, 2), round(total - 0.3, 2)],
    "pain": e3["pain"], "claims": e3["claims"], "scenes": scenes,
    "caption": "Spend the day out here.\n\nA newborn at 8. A family in the fall leaves at 1. Priya and Sam's lakeside wedding at golden hour. A birthday under string lights at 9.\nWhile you shoot, your clients book from your booking page, sign their contract in the browser and pay into your own Stripe. It all lands in one Snap inbox, waiting for you at the end of the day.\nSnap takes 0% commission.\n\nIt is not magic: you still send the contract, the invoice and the gallery. Snap just keeps every reply and payment in one place.\n\nStart free at snaphq.app",
    "hashtags": e3["hashtags"], "ad": e3["ad"],
}
json.dump(spec, open(f"{EP}/spec.json", "w"), indent=2)
print("S01", total, "s,", len(scenes), "scenes")
