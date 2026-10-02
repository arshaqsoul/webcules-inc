"""Social cuts for the meet-snap launch video.

Takes out/meet-snap.mp4 (1920x1080 master) and renders:
  - meet-snap-square.mp4   1080x1080 (feed/LinkedIn/X)
  - meet-snap-vertical.mp4 1080x1920 (Reels/Shorts/TikTok)

Layout per cut: blurred, darkened fill from the master frame; the sharp
16:9 video centered; scene captions burned in the band below (Inter 600,
white with soft shadow). Caption PNGs are pre-rendered per scene cue and
overlaid with enable=between(t,st,en).
"""
import json, os, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FF = r"C:\Users\arsha\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"
VS = r"C:\Users\arsha\Documents\projects\webcules\webcules-inc\.learn-videos\meet-snap"
OUT = os.path.join(VS, "out")
MASTER = os.path.join(OUT, "meet-snap.mp4")
FONT = r"C:\Users\arsha\Documents\projects\webcules\webcules-inc\.learn-videos\meet-snap\Inter-600.ttf"
GAP = 0.8
INTRO_S = 2.8
MASTER_DUR = float(subprocess.run(
    [r"C:\Users\arsha\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffprobe.exe",
     "-v", "error", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", MASTER],
    capture_output=True, text=True).stdout.strip())
SCENES = ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"FFMPEG FAIL: {' '.join(cmd[:8])}...\n{r.stderr[-800:]}")

script = json.load(open(os.path.join(VS, "script.json")))
NARR = {sc["id"]: sc["narration"] for sc in script["scenes"]}
# Short marketing captions for burned-in social text (muted autoplay);
# claims stay inside docs/SNAP-30-DAY-LAUNCH-STRATEGY.md truth sheet.
SOCIAL = {
    "s01": "The studio platform for photographers — 0% commission. Ever.",
    "s02": "One link: session, time, deposit. Booked in under a minute.",
    "s03": "Every inquiry lands in Leads.",
    "s04": "A pipeline built for shoots — files, gallery, invoices, contracts.",
    "s05": "Ten designer templates. Preview with your photos. Live.",
    "s06": "Verified links, six-digit codes, favorites and prints.",
    "s07": "Payments go to your own Stripe. 0% commission — ever.",
    "s08": "Start free: 20 GB, no credit card.",
}

vo_durs = {}
for s in SCENES:
    with wave.open(os.path.join(VS, "vo", f"{s}.wav"), "rb") as f:
        vo_durs[s] = f.getnframes() / f.getframerate()
starts, cum = {}, INTRO_S
for s in SCENES:
    starts[s] = cum
    cum += vo_durs[s] + GAP

def wrap2(text, limit=46):
    words, lines, cur = text.split(), [], ""
    for w0 in words:
        if len(cur) + len(w0) + 1 > limit and cur:
            lines.append(cur); cur = w0
        else:
            cur = (cur + " " + w0).strip()
    if cur: lines.append(cur)
    return lines[:2]

def caption_png(text, out_png, max_w):
    fnt = ImageFont.truetype(FONT, 52)
    lines = wrap2(text, 42)
    d0 = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    widths = [d0.textbbox((0, 0), ln, font=fnt)[2] - d0.textbbox((0, 0), ln, font=fnt)[0] for ln in lines]
    if max(widths) > max_w:
        fnt = ImageFont.truetype(FONT, 44)
        widths = [d0.textbbox((0, 0), ln, font=fnt)[2] - d0.textbbox((0, 0), ln, font=fnt)[0] for ln in lines]
    lh = int(fnt.size * 1.32)
    W, H = max_w, lh * len(lines) + 24
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = 12
    for ln in lines:
        bb = d.textbbox((0, 0), ln, font=fnt)
        x = (W - (bb[2] - bb[0])) / 2
        d.text((x + 2, y + 3), ln, font=fnt, fill=(10, 10, 25, 160))  # shadow
        d.text((x, y), ln, font=fnt, fill=(255, 255, 255, 255))
        y += lh
    img.save(out_png)

def social_cut(W, H, vid_y, cap_y, name):
    vw = W
    vh = round(W * 9 / 16 / 2) * 2  # 608 at 1080
    cap_dir = os.path.join(OUT, f"caps_{name}")
    os.makedirs(cap_dir, exist_ok=True)
    caps = []
    for i, s in enumerate(SCENES):
        p = os.path.join(cap_dir, f"c{i:02d}.png")
        caption_png(SOCIAL[s], p, int(W * 0.86))
        caps.append((p, starts[s], starts[s] + vo_durs[s]))
    inputs = ["-i", MASTER]
    for p, _, _ in caps:
        inputs += ["-loop", "1", "-i", p]
    fc = (
        f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
        f"gblur=sigma=28,eq=brightness=-0.18:saturation=1.05[bg];"
        f"[0:v]scale={vw}:{vh}[fg];"
        f"[bg][fg]overlay=0:{vid_y}[b0]"
    )
    for i, (p, st, en) in enumerate(caps):
        src = f"[{i+1}:v]"
        fc += (
            f";{src}format=rgba,fade=t=in:st=0:d=0.18:alpha=1,"
            f"setpts=PTS+{st:.2f}/TB[c{i}];"
            f"[b{i}][c{i}]overlay=(W-w)/2:{cap_y}:eof_action=pass:enable='between(t,{st:.2f},{en:.2f})'[b{i+1}]"
        )
    fc += f";[b{len(caps)}]format=yuv420p[v]"
    out = os.path.join(OUT, name)
    run([FF, "-v", "error", "-y"] + inputs + [
        "-filter_complex", fc, "-map", "[v]", "-map", "0:a?",
        "-t", f"{MASTER_DUR:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", out])
    print(name, "done")

social_cut(1080, 1080, 150, 820, "meet-snap-square.mp4")
social_cut(1080, 1920, 560, 1260, "meet-snap-vertical.mp4")

# poster frame (editorial cover moment in s06)
run([FF, "-v", "error", "-y", "-ss", "43.0", "-i", MASTER, "-frames:v", "1", "-q:v", "3",
     os.path.join(OUT, "meet-snap-poster.jpg")])
print("poster done")
