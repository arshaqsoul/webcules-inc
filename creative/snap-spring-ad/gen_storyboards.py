#!/usr/bin/env python3
"""Roger — WEBC-109 storyboard drafts: one 16:9 frame per scene (1-7, 9).
Scene 8 is REAL Snap product UI (Gwen's recording pipeline) — never generated.
Same flux-schnell pipeline; Buck miniature style per plan §2."""
import json
import time
import urllib.request
from pathlib import Path

HOST = "http://172.25.192.1:8188"
CKPT = "flux1-schnell-fp8.safetensors"
OUT = Path(__file__).parent / "storyboards"
OUT.mkdir(parents=True, exist_ok=True)

# Fused DNA: Buck miniature look + cast/location locks from plan §4-5
STYLE = (
    "tilt-shift miniature diorama cinematic film still, macro lens feel, "
    "extremely shallow depth of field, warm pastel spring palette of blossom "
    "pink tender green and butter cream, soft golden light, living breathing "
    "details, atmospheric petal and dust particles in the air, the miniature "
    "world extends past all frame edges, photorealistic materials, no text, "
    "no watermark. Cast: mother with shoulder-length dark brown hair, cream "
    "knit cardigan, sage-green midi skirt; father with short black hair, "
    "light beard, sand linen shirt, olive chinos; 6-year-old girl with curly "
    "pigtails in a blush-pink tulle dress; 3-year-old toddler in powder-blue "
    "dungarees holding a grey stuffed rabbit; photographer with salt-and-pepper "
    "bun, rectangular glasses, charcoal gilet over oatmeal roll-neck, tan film "
    "camera."
)

FRAMES = [
    ("sb_01_anticipation", (
        "Scene: inside a cozy miniature cottage living room at golden dawn, "
        "sunlight and dust motes through the east window, the mother crouches "
        "pinning a tiny daisy hair clip into the little girl's curly pigtails, "
        "the toddler boy dashes past in the mid-ground hugging his stuffed "
        "rabbit, the father kneels holding tiny shoes by the coat hooks.")),
    ("sb_02_booked_arrived", (
        "Scene: a tiny vintage car drives down a narrow lane between rows of "
        "blossoming cherry trees toward the viewer, petals drifting, warm "
        "morning light, storybook smallness.")),
    ("sb_03_the_world", (
        "Scene: extreme wide shot, the whole family walks in tiny silhouette "
        "down a grass path between towering rows of full-bloom blossom trees, "
        "loose petals drift and settle on the grass, a bed of tulips in the "
        "foreground blurred, soft overcast morning light.")),
    ("sb_04_lineup", (
        "Scene: medium shot among the blossom trees, the photographer with his "
        "camera kneels adjusting the family's positions, the little girl "
        "wiggles and will not hold still, the parents laugh, petals fall "
        "around them, candid alive energy.")),
    ("sb_05_the_shots", (
        "Scene: low camera angle through a blurred wall of tulips in the "
        "foreground, the father lifts the laughing toddler up toward a blossom "
        "branch, petals hang frozen mid-air, the mother and daughter twirl "
        "beyond them with the girl's tulle skirt flaring, joyful motion.")),
    ("sb_06_golden_hour", (
        "Scene: golden hour backlit glow under a blossom canopy, the family "
        "snuggles together on a picnic blanket, rim-lit with warm haze, the "
        "photographer stands just beyond taking the final frame, long soft "
        "shadows.")),
    ("sb_07_the_cull", (
        "Scene: evening at a small photographer's studio desk, seen from "
        "behind his shoulder, the monitor glows with a grid of photos, one "
        "frame starred, a cup of tea with a thin curl of steam rising, warm "
        "desk lamp against deep blue dusk in the window, quiet and still.")),
    ("sb_09_endcard", (
        "Scene: the cozy living room at bright spring morning, a framed family "
        "photograph now hangs on the wall above the sofa, through the window "
        "the blossoming orchard glows outside, fresh tulips in a vase on the "
        "table, peaceful and complete.")),
]


def run(name, pos, seed):
    t0 = time.time()
    prompt = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": STYLE + " " + pos, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 4, "cfg": 1.0,
            "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
            "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": name, "images": ["6", 0]}},
    }
    req = urllib.request.Request(
        f"{HOST}/prompt",
        data=json.dumps({"prompt": prompt}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        pid = json.loads(r.read())["prompt_id"]
    while True:
        time.sleep(2)
        with urllib.request.urlopen(f"{HOST}/history/{pid}", timeout=30) as r:
            hist = json.loads(r.read())
        if pid in hist:
            for node in hist[pid]["outputs"].values():
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


def main():
    lines = ["", "## storyboard drafts (scenes 1-7, 9; scene 8 = real Snap UI)", ""]
    for i, (name, pos) in enumerate(FRAMES):
        wall, dest = run(name, pos, seed=110000 + i)
        print(f"DONE {name} wall={wall:.1f}s -> {dest}")
        lines.append(f"| {name} | flux1-schnell-fp8, 1344x768, 4 steps, cfg 1.0, euler/simple, seed={110000+i} | {wall:.1f}s | {dest} |")
    with (Path(__file__).parent / "ledger.md").open("a") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
