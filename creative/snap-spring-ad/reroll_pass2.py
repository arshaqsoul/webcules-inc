#!/usr/bin/env python3
"""Roger — WEBC-109 re-roll pass 2: father_03 (empty strap, rephrased) +
photographer_03 (younger read on 41y lock). Best-of picked at QC."""
import json
import time
import urllib.request
from pathlib import Path

HOST = "http://172.25.192.1:8188"
CKPT = "flux1-schnell-fp8.safetensors"
OUT = Path(__file__).parent / "sheets"

CHAR_STYLE = (
    "professional character reference photograph, single full-body standing "
    "figure, front view, relaxed natural pose, seamless plain warm light-grey "
    "studio backdrop, soft even diffused studio lighting, photorealistic, "
    "natural skin texture, sharp focus, 85mm portrait lens look, "
    "clean minimal composition, no text, no labels, no watermark, no collage"
)

SHEETS = [
    ("sheet_father_03", 896, 1152, CHAR_STYLE + (
        " Subject: a 36 year old man, 181cm athletic build, short black hair, "
        "light beard trimmed close, hazel eyes, wearing a sand-colored linen "
        "shirt with sleeves rolled, olive chinos rolled once at the ankle, "
        "brown leather loafers, and a single worn brown leather strap crossing "
        "his torso over one shoulder, the strap hanging loose with nothing "
        "attached to it at all, both his hands empty, relaxed happy expression."
    )),
    ("sheet_photographer_03", 896, 1152, CHAR_STYLE + (
        " Subject: a 41 year old man with a youthful face, 175cm lean build, "
        "dark brown hair with only a few grey strands at the temples tied back "
        "in a small top bun, short neatly trimmed beard with slight greying, "
        "rectangular glasses, wearing a charcoal-grey wool gilet vest over a "
        "cream oatmeal-colored roll-neck sweater, khaki canvas field trousers "
        "and brown hiking boots, holding a weathered tan film camera with a "
        "silver top plate and a worn leather strap, calm professional "
        "expression."
    )),
]


def run(name, w, h, pos, seed):
    t0 = time.time()
    prompt = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
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
    lines = ["", "## re-roll QC pass 2", ""]
    for i, (name, w, h, pos) in enumerate(SHEETS):
        wall, dest = run(name, w, h, pos, seed=109100 + i)
        print(f"DONE {name} wall={wall:.1f}s -> {dest}")
        lines.append(f"| {name} | flux1-schnell-fp8, {w}x{h}, 4 steps, cfg 1.0, euler/simple, seed={109100+i} | {wall:.1f}s | {dest} |")
    with (Path(__file__).parent / "ledger.md").open("a") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
