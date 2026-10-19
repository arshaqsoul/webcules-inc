#!/usr/bin/env python3
"""Roger — Snap Spring ad (WEBC-109): $0 sheet factory.

Generates 5 character sheets + 3 location sheets via local flux1-schnell
(ComfyUI API @ 172.25.192.1:8188). Logs one ledger line per asset:
asset | settings | wall_s | file
"""
import json
import time
import urllib.request
from pathlib import Path

HOST = "http://172.25.192.1:8188"
CKPT = "flux1-schnell-fp8.safetensors"
OUT = Path(__file__).parent / "sheets"
OUT.mkdir(parents=True, exist_ok=True)

# --- Kaye discipline: technical prompts derived from the director's brief.
# Character sheets: clean neutral reference framing (these become generation
# references — no props/backgrounds that could leak into scene gens).
CHAR_STYLE = (
    "professional character reference photograph, single full-body standing "
    "figure, front view, relaxed natural pose, seamless plain warm light-grey "
    "studio backdrop, soft even diffused studio lighting, photorealistic, "
    "natural skin texture, sharp focus, 85mm portrait lens look, "
    "clean minimal composition, no text, no labels, no watermark, no collage"
)

LOC_STYLE = (
    "tilt-shift miniature diorama photograph, macro lens feel, extremely "
    "shallow depth of field with a thin focus plane, the miniature world "
    "extends past all frame edges so nothing is isolated against a blank "
    "backdrop, warm pastel spring palette of blossom pink tender green and "
    "butter cream, soft golden light, living breathing details with atmospheric "
    "particles in the air, cinematic production still, photorealistic materials, "
    "no people, no text, no watermark"
)

SHEETS = [
    # ---- CHARACTER SHEETS (numeric locks from plan §4) ----
    ("sheet_mother_01", 896, 1152, CHAR_STYLE + (
        " Subject: a 34 year old woman, 168cm tall slender build, "
        "shoulder-length dark brown hair, warm brown eyes, a small mole on her "
        "right cheekbone, wearing a cream knit cardigan over a sage-green midi "
        "skirt and white sneakers, a tiny pressed-flower hair clip in her hair, "
        "gentle warm expression."
    )),
    ("sheet_father_01", 896, 1152, CHAR_STYLE + (
        " Subject: a 36 year old man, 181cm athletic build, short black hair, "
        "light beard trimmed close, hazel eyes, wearing a sand-colored linen "
        "shirt with sleeves rolled, olive chinos rolled once at the ankle, "
        "brown leather loafers, a vintage leather camera strap slung across "
        "his shoulder with no camera attached, relaxed happy expression."
    )),
    ("sheet_daughter_01", 896, 1152, CHAR_STYLE + (
        " Subject: a cheerful 6 year old girl, 116cm small child, curly dark "
        "brown hair in pigtails, a gap-tooth grin, wearing a blush-pink tulle "
        "party dress with a full skirt, white tights and black mary-jane shoes, "
        "a small white daisy bracelet on her wrist."
    )),
    ("sheet_son_01", 896, 1152, CHAR_STYLE + (
        " Subject: a 3 year old toddler boy, 94cm small toddler, fine dark "
        "hair, round cheeks, wearing powder-blue dungarees over a white t-shirt "
        "and tiny canvas shoes, hugging a small soft grey stuffed rabbit toy "
        "against his chest."
    )),
    ("sheet_photographer_01", 896, 1152, CHAR_STYLE + (
        " Subject: a 41 year old man, 175cm lean build, salt-and-pepper hair "
        "tied in a bun, rectangular glasses, wearing a charcoal gilet vest over "
        "an oatmeal roll-neck sweater, khaki canvas field trousers and hiking "
        "boots, holding a weathered tan film camera with a silver top plate and "
        "a worn leather strap, calm professional expression."
    )),
    # ---- LOCATION SHEETS (plan §5, Buck miniature style) ----
    ("loc_home_dawn_01", 1344, 768, LOC_STYLE + (
        " Scene: a cozy cottage living room interior at dawn, low golden "
        "sunlight streaming through an east-facing window with dust motes "
        "floating in the light beams, a hallway mirror on the wall, coat hooks "
        "by the door holding four colorful spring jackets, a small sofa with "
        "knit blankets, tiny framed photos."
    )),
    ("loc_orchard_day_01", 1344, 768, LOC_STYLE + (
        " Scene: an orchard in full spring bloom, neat rows of cherry and "
        "apricot trees covered in pink and white blossoms receding into soft "
        "mist, a grass path between the rows, a bed of pink and yellow tulips "
        "in the foreground, soft morning overcast light, loose blossom petals "
        "drifting through the air and settling on the grass."
    )),
    ("loc_desk_evening_01", 1344, 768, LOC_STYLE + (
        " Scene: a small photographer's studio desk at evening, a computer "
        "monitor showing a soft photo-grid glow, a single warm desk lamp, deep "
        "blue dusk visible through a small window, a cup of tea with a thin "
        "curl of steam rising, scattered film prints and a loupe, wrapped in "
        "cozy shadows at the edges."
    )),
]

NEG = ""  # schnell is CFG-1 distilled; negatives are inert


def build_prompt(png_name: str, w: int, h: int, pos: str) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG or pos[:0], "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": int(time.time()) & 0x7FFFFFFF, "steps": 4, "cfg": 1.0,
            "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
            "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": png_name, "images": ["6", 0]}},
    }


def run(name: str, w: int, h: int, pos: str) -> tuple[float, Path]:
    t0 = time.time()
    req = urllib.request.Request(
        f"{HOST}/prompt",
        data=json.dumps({"prompt": build_prompt(name, w, h, pos)}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        pid = json.loads(r.read())["prompt_id"]
    while True:
        time.sleep(2)
        with urllib.request.urlopen(f"{HOST}/history/{pid}", timeout=30) as r:
            hist = json.loads(r.read())
        if pid in hist:
            outs = hist[pid]["outputs"]
            for node in outs.values():
                for img in node.get("images", []):
                    if img["type"] == "output":
                        url = f"{HOST}/view?filename={img['filename']}&subfolder={img['subfolder']}&type=output"
                        with urllib.request.urlopen(url, timeout=60) as ir:
                            data = ir.read()
                        dest = OUT / f"{name}.png"
                        dest.write_bytes(data)
                        return time.time() - t0, dest
        if time.time() - t0 > 600:
            raise TimeoutError(name)


def main() -> None:
    ledger = Path(__file__).parent / "ledger.md"
    lines = ["# WEBC-109 sheet-factory ledger — asset | settings | wall_s | file", ""]
    for name, w, h, pos in SHEETS:
        wall, dest = run(name, w, h, pos)
        line = (f"| {name} | flux1-schnell-fp8, {w}x{h}, 4 steps, cfg 1.0, euler/simple "
                f"| {wall:.1f}s | {dest} |")
        print(f"DONE {name} wall={wall:.1f}s -> {dest}")
        lines.append(line)
    with ledger.open("a") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
