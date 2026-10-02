#!/usr/bin/env python3
"""Snap Template Studio — ComfyUI sample-photo pack generator (WEB-319).

Generates the 6-genre sample photography pack (wedding / family / party /
newborn / corporate / editorial, 10 photos each) against the local ComfyUI
API (default http://127.0.0.1:8188) using SDXL base fp16, then produces:

  tools/sample-pack/<genre>/master/<genre>-NN.jpg   (Lanczos-upscaled, ~3000px class, q90)
  tools/sample-pack/<genre>/web/<genre>-NN.jpg      (long side 2048, q82)
  tools/sample-pack/<genre>/thumb/<genre>-NN.jpg    (long side 480, q80)
  tools/sample-pack.json                            (manifest: files, genre, prompt, seed, license note)

All images are AI-generated (SDXL) — no model release required, never
attributed to a real studio. See WEB-319 for the license-hygiene note.

Usage:  python tools/generate-sample-pack.py [--comfy http://127.0.0.1:8188] [--only wedding,family]
"""

import argparse
import hashlib
import io
import json
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

COMFY_DEFAULT = "http://127.0.0.1:8188"
CKPT = "sd_xl_base_1.0_fp16.safetensors"
STEPS = 30
CFG = 6.5
SAMPLER = "dpmpp_2m"
SCHEDULER = "karras"
BASE_SEED = 20261001  # deterministic per (genre, index) via hash

NEGATIVE = (
    "cartoon, illustration, painting, anime, cgi, 3d render, plastic skin, wax figure, "
    "deformed hands, extra fingers, mutated limbs, bad anatomy, watermark, text, caption, "
    "logo, oversaturated, hdr halos, lowres, blurry, jpeg artifacts, worst quality, "
    "duplicate person, cropped head"
)

QUALITY = (
    "professional photograph, shot on full-frame DSLR, 85mm lens, natural light, "
    "photorealistic, sharp focus, high dynamic range, editorial quality"
)

# (prompt, aspect) — aspect is an SDXL-native bucket. Mix of landscape/portrait/square
# mimics a real delivered shoot.
GENRES: dict[str, list[tuple[str, tuple[int, int]]]] = {
    "wedding": [
        ("wide shot of an elegant outdoor wedding ceremony, flower arch with white roses, guests seated on white chairs, golden hour backlight", (1344, 768)),
        ("bride and groom kissing at the altar, confetti in the air, romantic backlit moment, shallow depth of field", (832, 1216)),
        ("macro photograph of two gold wedding rings on a blush peony petal, soft bokeh", (1216, 832)),
        ("portrait of a bride in lace gown by a tall window, veil catching light, timeless elegance", (832, 1216)),
        ("reception table setting with candles, eucalyptus runners and gold cutlery, warm evening ambiance", (1344, 768)),
        ("candid guests laughing during speeches at a wedding reception, string lights bokeh background", (1344, 768)),
        ("bridal bouquet of white garden roses and eucalyptus held against silk dress, soft window light", (896, 1152)),
        ("bride and groom first dance under a chandelier, spotlight, guests watching, cinematic", (1216, 832)),
        ("detail shot of embroidery and buttons on a hanging wedding dress, soft morning light", (896, 1152)),
        ("wedding couple walking away hand in hand down a tree-lined avenue at dusk, off-camera flash editorial style", (1344, 768)),
    ],
    "family": [
        ("family of four on a picnic blanket in a sunlit meadow, laughing together, golden hour warmth", (1344, 768)),
        ("two siblings running through tall grass toward camera, backlit sun flare, joyful motion", (1344, 768)),
        ("father lifting his laughing daughter onto his shoulders against a blue sky", (832, 1216)),
        ("family walking a forest path in autumn, warm coats, fallen leaves, cozy atmosphere", (896, 1152)),
        ("mother and son sharing a hug on a porch swing, soft afternoon light", (896, 1152)),
        ("children playing with a golden retriever on a beach at sunset, silhouettes and reflections", (1344, 768)),
        ("multigenerational family portrait in a park, grandparents parents and kids, natural smiles", (1216, 832)),
        ("toddler sitting among pumpkins at an autumn farm market, genuine laugh, overalls", (832, 1216)),
        ("family baking together in a bright kitchen, flour dust in the air, candid lifestyle", (1344, 768)),
        ("parents kissing their baby's cheeks between them on a bed, white linens, morning light", (1216, 832)),
    ],
    "party": [
        ("crowd dancing under confetti explosion at a party, dynamic energy, flash photography style", (1344, 768)),
        ("dj booth with neon lights and raised hands, low-light club atmosphere, vibrant magenta and cyan", (1344, 768)),
        ("friends toasting cocktails with sparklers on a rooftop at night, city lights behind", (1216, 832)),
        ("birthday girl blowing out candles on a layered cake, dark room lit by candlelight and bokeh", (832, 1216)),
        ("guests laughing at an outdoor evening party under string lights, patio dinner table", (1344, 768)),
        ("close-up of champagne glasses clinking with fizz, celebratory mood, rim light", (1216, 832)),
        ("singer performing at an intimate live venue, stage lights, crowd silhouettes in foreground", (1344, 768)),
        ("kids with glow sticks dancing at a birthday party, colorful motion blur, joyful", (896, 1152)),
        ("confetti raining on a dancing couple at a milestone anniversary party, gold light", (832, 1216)),
        ("group of friends jumping in the air at a beach bonfire party at dusk, flash freeze", (1344, 768)),
    ],
    "newborn": [
        ("newborn baby wrapped in a cream knit blanket, sleeping peacefully, studio soft light, beige backdrop", (896, 1152)),
        ("macro of a newborn's tiny hand gripping a parent's finger, ultra soft focus", (1216, 832)),
        ("newborn sleeping in a woven basket with a knitted hat, next to dried flowers, warm tones", (896, 1152)),
        ("newborn nursery corner with soft toys and a linen curtain, gentle morning window light", (1216, 832)),
        ("mother cradling her newborn against her shoulder in white linen, tender backlit moment", (832, 1216)),
        ("newborn yawning on a soft muslin blanket, wrapped in pastel tones, overhead shot", (1024, 1024)),
        ("detail of tiny newborn feet in a parent's palm, warm skin tones, soft shadow", (1216, 832)),
        ("father holding newborn against his chest, black and white fine art style, soft contrast", (832, 1216)),
        ("newborn twins sleeping curled together in a wrap, neutral studio setup, delicate", (1024, 1024)),
        ("flat lay of newborn props: knitted booties, headband, wooden rattle on linen, top-down", (1216, 832)),
    ],
    "corporate": [
        ("modern office team collaborating around a glass table, laptops and coffee, bright natural light", (1344, 768)),
        ("confident businesswoman portrait in a tailored suit against a city skyline window", (832, 1216)),
        ("candid of colleagues laughing during a meeting in a sunlit coworking space", (1344, 768)),
        ("minimal desk workspace with laptop, notebook and espresso, shallow depth of field", (1216, 832)),
        ("business handshake between two professionals in a bright modern lobby", (1344, 768)),
        ("boardroom with a presentation on screen, diverse team listening attentively", (1344, 768)),
        ("male executive portrait with folded arms in an industrial-chic office, soft window light", (832, 1216)),
        ("engineer reviewing plans at a standing desk in a bright tech office, green plants", (896, 1152)),
        ("team standing confidently in a line in a modern office atrium, professional group portrait", (1216, 832)),
        ("close-up of hands typing on a laptop over a marble table with coffee, business casual", (1216, 832)),
    ],
    "editorial": [
        ("high fashion model in a flowing red gown against a brutalist concrete wall, dramatic shadows", (832, 1216)),
        ("studio fashion portrait, model in avant-garde black outfit, single hard light, deep shadows", (832, 1216)),
        ("street style photograph of a stylish woman crossing a city street, motion and wind in her coat", (896, 1152)),
        ("beauty close-up with bold red lips and dewy skin, sculpted studio lighting, neutral backdrop", (1024, 1024)),
        ("male model in a tailored camel coat on an empty foggy street at dawn, cinematic mood", (832, 1216)),
        ("model in white suit mid-twirl, fabric in motion, seamless grey studio backdrop", (896, 1152)),
        ("fashion editorial with model seated on a vintage chair, warm gelled light, film grain", (1216, 832)),
        ("black and white editorial portrait, strong side profile, rim light, grain", (832, 1216)),
        ("model in a patterned summer dress under palm shadows, riviera vibe, hard sunlight patterns", (896, 1152)),
        ("duo fashion editorial, two models back to back in monochrome outfits, minimal studio", (1216, 832)),
    ],
}


def http_json(url: str, payload: dict | None = None, timeout: int = 30) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def http_bytes(url: str, timeout: int = 120) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return resp.read()


def build_graph(prompt: str, negative: str, width: int, height: int, seed: int) -> dict:
    return {
        "3": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": STEPS, "cfg": CFG, "sampler_name": SAMPLER, "scheduler": SCHEDULER,
            "denoise": 1.0, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "snap_samples", "images": ["8", 0]}},
    }


def seed_for(genre: str, idx: int, attempt: int = 0) -> int:
    h = hashlib.sha256(f"{BASE_SEED}:{genre}:{idx}:{attempt}".encode()).digest()
    return int.from_bytes(h[:4], "big") % (2**31)


def generate_one(comfy: str, genre: str, idx: int, prompt: str, size: tuple[int, int]) -> tuple[bytes, int]:
    """Queue one prompt, wait for it, return (png_bytes, seed). Retries once with a new seed."""
    last_err = None
    for attempt in range(2):
        seed = seed_for(genre, idx, attempt)
        graph = build_graph(f"{prompt}, {QUALITY}", NEGATIVE, size[0], size[1], seed)
        prompt_id = http_json(f"{comfy}/prompt", {"prompt": graph, "client_id": "snap-sample-pack"})["prompt_id"]
        deadline = time.time() + 900
        while time.time() < deadline:
            time.sleep(3)
            try:
                hist = http_json(f"{comfy}/history/{prompt_id}", timeout=15)
            except urllib.error.URLError:
                continue
            entry = hist.get(prompt_id)
            if entry is None:
                continue
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                last_err = f"comfy error: {json.dumps(status.get('messages', []))[:400]}"
                break
            for node_out in entry.get("outputs", {}).values():
                for img in node_out.get("images", []):
                    if img.get("type") == "output":
                        q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": "output"})
                        return http_bytes(f"{comfy}/view?{q}"), seed
            if entry.get("status", {}).get("completed"):
                last_err = "history completed without output images"
                break
        if last_err is None:
            last_err = "timeout waiting for prompt"
        print(f"    retry after: {last_err}", flush=True)
    raise RuntimeError(f"generation failed for {genre}-{idx + 1:02d}: {last_err}")


def derivatives(img: Image.Image, genre: str, idx: int, outdir: Path) -> dict:
    name = f"{genre}-{idx + 1:02d}"
    img = img.convert("RGB")
    w, h = img.size
    long_side = max(w, h)

    # master: Lanczos upscale to ~3000px class long side (SDXL native is ~1.2-1.3k)
    master = img.resize((round(w * 3000 / long_side), round(h * 3000 / long_side)), Image.LANCZOS)
    web = img.resize((round(w * 2048 / long_side), round(h * 2048 / long_side)), Image.LANCZOS)
    thumb = img.resize((round(w * 480 / long_side), round(h * 480 / long_side)), Image.LANCZOS)

    paths = {}
    for label, im, q in (("master", master, 90), ("web", web, 82), ("thumb", thumb, 80)):
        d = outdir / genre / label
        d.mkdir(parents=True, exist_ok=True)
        p = d / f"{name}.jpg"
        im.save(p, "JPEG", quality=q, optimize=True, progressive=(label != "master"))
        paths[label] = str(p.relative_to(outdir)).replace("\\", "/")
    return {"name": name, "paths": paths, "width": w, "height": h,
            "masterWidth": master.size[0], "masterHeight": master.size[1]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--comfy", default=COMFY_DEFAULT)
    ap.add_argument("--only", default="", help="comma-separated genres (default all)")
    args = ap.parse_args()

    outdir = Path(__file__).resolve().parent / "sample-pack"
    outdir.mkdir(parents=True, exist_ok=True)
    only = {g.strip() for g in args.only.split(",") if g.strip()}

    # health check
    stats = http_json(f"{args.comfy}/system_stats", timeout=10)
    dev = stats["devices"][0]["name"] if stats.get("devices") else "?"
    print(f"ComfyUI {stats['system']['comfyui_version']} on {dev}", flush=True)

    manifest_path = outdir.parent / "sample-pack.json"
    manifest = {"version": 1, "generator": f"ComfyUI {stats['system']['comfyui_version']} / {CKPT}",
                "license": "AI-generated (SDXL). No subject rights, no model release required. "
                           "Render in template previews only; never attributed to a real studio.",
                "genres": {}}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            pass

    total_t0 = time.time()
    for genre, shots in GENRES.items():
        if only and genre not in only:
            continue
        print(f"[{genre}] {len(shots)} photos", flush=True)
        entries = []
        for idx, (prompt, size) in enumerate(shots):
            t0 = time.time()
            png, seed = generate_one(args.comfy, genre, idx, prompt, size)
            img = Image.open(io.BytesIO(png))
            d = derivatives(img, genre, idx, outdir)
            d.update({"prompt": prompt, "seed": seed, "aspect": f"{size[0]}x{size[1]}"})
            entries.append(d)
            print(f"    {d['name']}  {d['width']}x{d['height']} -> master {d['masterWidth']}x{d['masterHeight']}  ({time.time() - t0:.0f}s)", flush=True)
            manifest["genres"][genre] = entries
            manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"[{genre}] done", flush=True)

    print(f"ALL DONE in {(time.time() - total_t0) / 60:.1f} min — manifest at {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
