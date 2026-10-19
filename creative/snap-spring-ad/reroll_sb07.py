#!/usr/bin/env python3
"""Roger — WEBC-109 storyboard re-roll: sb_07 (photographer alone at desk)."""
import json
import time
import urllib.request
from pathlib import Path

HOST = "http://172.25.192.1:8188"
OUT = Path(__file__).parent / "storyboards"

STYLE = (
    "tilt-shift miniature diorama cinematic film still, macro lens feel, "
    "extremely shallow depth of field, warm pastel spring palette, soft golden "
    "light, living breathing details, photorealistic materials, no text, no "
    "watermark, only one person in the scene"
)
POS = (
    "Scene: evening at a small photographer's studio desk. A 41 year old man "
    "with dark hair in a small salt-and-pepper bun, rectangular glasses, "
    "charcoal gilet over an oatmeal roll-neck sweater, sits ALONE at his desk "
    "seen from behind and slightly to the side, facing away from camera, "
    "culling photographs on a glowing monitor showing a grid of orchard "
    "photos, a cup of tea with a thin curl of steam beside him, warm desk "
    "lamp, deep blue dusk in the small window, scattered film prints, quiet "
    "and still."
)


def main():
    t0 = time.time()
    prompt = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-schnell-fp8.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": STYLE + " " + POS, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": 110007, "steps": 4, "cfg": 1.0,
            "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
            "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "sb_07_the_cull_v2", "images": ["6", 0]}},
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
                        dest = OUT / "sb_07_the_cull_v2.png"
                        dest.write_bytes(data)
                        wall = time.time() - t0
                        print(f"DONE sb_07_the_cull_v2 wall={wall:.1f}s -> {dest}")
                        with (Path(__file__).parent / "ledger.md").open("a") as f:
                            f.write(f"| sb_07_the_cull_v2 | flux1-schnell-fp8, 1344x768, 4 steps, cfg 1.0, euler/simple, seed=110007 | {wall:.1f}s | {dest} |\n")
                        return
        if time.time() - t0 > 600:
            raise TimeoutError("sb_07")


if __name__ == "__main__":
    main()
