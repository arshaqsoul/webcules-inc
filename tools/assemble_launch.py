"""Assemble the meet-snap launch video (landing 16:9 master + social cuts).

Same recipe as tools/assemble_intro.py (the shipped intro-to-snap look):
VO-locked timeline = intro sting (2.8s) + per-scene clip (VO + 0.8s gap) +
outro sting (3.5s); shutter-mascot PiP over the narration span; sidecar .vtt.
Additions for the launch cut: synthesized ambient music bed (numpy pad,
ducked against the narration envelope - license-clean, swappable) and
1:1 / 9:16 social reframes with burned captions.

Outputs (out/): meet-snap.mp4, meet-snap.vtt, poster, square/vertical cuts.
"""
import json, os, math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FF = r"C:\Users\arsha\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"
FP = r"C:\Users\arsha\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffprobe.exe"
VS = r"C:\Users\arsha\Documents\projects\webcules\webcules-inc\.learn-videos\meet-snap"
CLIPS = os.path.join(VS, "clips")
OUT = os.path.join(VS, "out")
os.makedirs(OUT, exist_ok=True)
GAP = 0.8
INTRO_S, OUTRO_S = 2.8, 3.5
PIP_W, PIP_H = 300, 330
PIP_X, PIP_Y = 1592, 722
FPS = 30

SCENES = ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"FFMPEG FAIL: {' '.join(cmd[:6])}...\n{r.stderr[-800:]}")

def dur(p):
    r = subprocess.run([FP, "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=noprint_wrappers=1:nokey=1", p],
                       capture_output=True, text=True)
    return float(r.stdout.strip())

script = json.load(open(os.path.join(VS, "script.json")))
NARR = {sc["id"]: sc["narration"] for sc in script["scenes"]}

# ---------- 1. per-scene trimmed clips (VO + GAP), uniform encode ----------
vo_durs = {}
for s in SCENES:
    w = os.path.join(VS, "vo", f"{s}.wav")
    with wave.open(w, "rb") as f:
        vo_durs[s] = f.getnframes() / f.getframerate()
print("vo durations:", {k: round(v, 2) for k, v in vo_durs.items()})

for s in SCENES:
    tgt = vo_durs[s] + GAP
    run([FF, "-v", "error", "-y", "-i", os.path.join(CLIPS, f"{s}.mp4"),
         "-vf", "tpad=stop_mode=clone:stop_duration=3",
         "-t", f"{tgt:.3f}", "-an", "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS),
         os.path.join(OUT, f"t_{s}.mp4")])
print("scene trims done")

# ---------- 2. brand sting cards (PIL) ----------
def sting_card(title, subtitle):
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img, "RGBA")
    tx0, ty0, tx1, ty1 = W//2-130, H//2-250, W//2+130, H//2+10
    for y in range(ty0, ty1):
        k = (y - ty0) / (ty1 - ty0)
        c = tuple(int(a + (b - a) * k) for a, b in zip((110, 113, 214), (67, 72, 159)))
        d.line([(tx0, y), (tx1, y)], fill=c)
    cx, cy, R = W//2, H//2-120, 92
    d.ellipse([cx-R, cy-R, cx+R, cy+R], fill=(23, 24, 27))
    for k in range(6):
        a0 = 40 + k * 60
        d.pieslice([cx-R+7, cy-R+7, cx+R-7, cy+R-7], a0, a0 + 76, fill=(232, 230, 245))
    d.ellipse([cx-30, cy-30, cx+30, cy+30], fill=(23, 24, 27))
    try:
        from PIL import ImageFont
        f_big = ImageFont.truetype(r"C:\Users\arsha\Documents\projects\webcules\webcules-inc\.learn-videos\meet-snap\Inter-600.ttf", 64)
        f_sm = ImageFont.truetype(r"C:\Users\arsha\Documents\projects\webcules\webcules-inc\.learn-videos\meet-snap\Inter-600.ttf", 34)
    except Exception:
        f_big = f_sm = None
    def center(y, text, font, fill):
        bb = d.textbbox((0, 0), text, font=font)
        d.text((W/2 - (bb[2]-bb[0])/2, y), text, font=font, fill=fill)
    center(H//2+70, title, f_big, (15, 16, 17))
    center(H//2+160, subtitle, f_sm, (90, 92, 120))
    return img

intro_png = os.path.join(OUT, "card_intro.png")
outro_png = os.path.join(OUT, "card_outro.png")
sting_card("Snap", "The studio platform for photographers").save(intro_png)
sting_card("Start free", "20 GB \u00b7 no credit card \u00b7 snap.webcules.com").save(outro_png)

def card_clip(png, secs, name):
    run([FF, "-v", "error", "-y", "-loop", "1", "-i", png, "-t", f"{secs:.3f}",
         "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
         "-pix_fmt", "yuv420p", os.path.join(OUT, name)])
card_clip(intro_png, INTRO_S, "t_intro.mp4")
card_clip(outro_png, OUTRO_S, "t_outro.mp4")
print("sting cards done")

# ---------- 3. master narration audio ----------
sil = os.path.join(OUT, "gap.wav")
run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
     "-t", f"{GAP:.3f}", sil])
lead = os.path.join(OUT, "lead_sil.wav")
run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
     "-t", f"{INTRO_S:.3f}", lead])
listf = os.path.join(OUT, "alist.txt")
with open(listf, "w") as f:
    f.write("file '" + lead.replace("\\", "/") + "'\n")
    for s in SCENES:
        f.write("file '" + os.path.join(VS, "vo", f"{s}.wav").replace("\\", "/") + "'\n")
        f.write("file '" + sil.replace("\\", "/") + "'\n")
master_wav = os.path.join(OUT, "narration_master.wav")
run([FF, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listf, master_wav])

# ---------- 4. video concat ----------
concatf = os.path.join(OUT, "vlist.txt")
with open(concatf, "w") as f:
    for n in ["t_intro.mp4"] + [f"t_{s}.mp4" for s in SCENES] + ["t_outro.mp4"]:
        f.write("file '" + os.path.join(OUT, n).replace("\\", "/") + "'\n")
base_mp4 = os.path.join(OUT, "base.mp4")
run([FF, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatf,
     "-c", "copy", base_mp4])
base_dur = dur(base_mp4)
print("base duration:", round(base_dur, 2))

# ---------- 5. music bed: synthesized ambient pad, ducked in numpy ----------
with wave.open(master_wav, "rb") as w:
    sr, n = w.getframerate(), w.getnframes()
    pcm = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
total = base_dur
N = int(total * sr)
t = np.arange(N) / sr

def note(freq, amp):
    # pure sines + soft octave shimmer, slowly breathing
    return amp * (np.sin(2*np.pi*freq*t) + 0.18*np.sin(2*np.pi*freq*2*t + 0.7)) \
        * (0.85 + 0.15*np.sin(2*np.pi*0.11*t + freq))

# Cmaj9 -> Em7 -> Fmaj9 -> G6, two passes (~56s, chords ~7s each)
CH = [
    [130.81, 196.00, 246.94, 293.66, 329.63],   # C3 G3 B3 D4 E4
    [164.81, 196.00, 246.94, 293.66, 369.99],   # E3 G3 B3 D4 F#4
    [174.61, 220.00, 261.63, 329.63, 349.23],   # F3 A3 C4 E4 F4
    [196.00, 246.94, 293.66, 329.63, 392.00],   # G3 B3 D4 E4 G4
] * 2
bed = np.zeros(N, dtype=np.float64)
seg = total / len(CH)
for i, chord in enumerate(CH):
    st, en = i * seg, (i + 1) * seg
    i0, i1 = int(st * sr), min(N, int(en * sr))
    env = np.ones(i1 - i0)
    a = int(2.0 * sr); r = int(2.5 * sr)
    a = min(a, len(env)); r = min(r, len(env))
    env[:a] = np.linspace(0, 1, a)
    env[-r:] = np.linspace(1, 0, r)
    seg_t = t[i0:i1]
    tone = np.zeros(i1 - i0)
    for j, f0 in enumerate(chord):
        tone += (1.0 / (j + 2)) * np.sin(2*np.pi*f0*seg_t + 0.3*j)
        tone += (0.12 / (j + 2)) * np.sin(2*np.pi*f0*2*seg_t + 1.1*j)
    bed[i0:i1] += tone * env
bed /= np.max(np.abs(bed)) + 1e-9
# gentle mono->wide stereo (haas)
delay = int(0.012 * sr)
bedL = bed.copy()
bedR = np.concatenate([np.zeros(delay), bed[:-delay]])
# duck against narration envelope (fast attack, slow release)
hop = sr // 20
NH = len(pcm) // hop
rms = np.array([math.sqrt(float(np.mean(pcm[i*hop:(i+1)*hop]**2)) + 1e-9) for i in range(NH)])
p95 = max(float(np.percentile(rms, 95)), 1e-4)
gate = np.clip((rms - 0.06 * p95) / (0.94 * p95), 0, 1)
sm = np.copy(gate)
for i in range(1, len(sm)):
    a = 0.5 if sm[i] > sm[i-1] else 0.06
    sm[i] = a * sm[i] + (1 - a) * sm[i-1]
duck = np.interp(np.arange(N) / hop * 1.0, np.arange(NH), 1.0 - 0.62 * sm)
bedL *= duck; bedR *= duck
BED_LEVEL = 0.16  # bed-only ~-31 dB mean (pad has high crest); ducked ~-40 under VO
stereo = np.stack([bedL * BED_LEVEL, bedR * BED_LEVEL], axis=1)
stereo = np.clip(stereo, -1, 1)
bed_wav = os.path.join(OUT, "bed.wav")
with wave.open(bed_wav, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())
print("music bed done")

# ---------- 6. shutter PiP frames for narration span ----------
PFPS = 25
NF = int((n / sr) * PFPS)
hop2 = sr // PFPS
rms2 = np.array([math.sqrt(float(np.mean(pcm[i*hop2:(i+1)*hop2]**2)) + 1e-9) for i in range(NF)])
p95 = max(float(np.percentile(rms2, 95)), 1e-4)
op = np.clip((rms2 - 0.08 * p95) / (0.92 * p95), 0, 1)
sm2 = np.copy(op)
for i in range(1, len(sm2)):
    a = 0.62 if sm2[i] > sm2[i-1] else 0.20
    sm2[i] = a * sm2[i] + (1 - a) * sm2[i-1]

pip_dir = os.path.join(OUT, "pip")
os.makedirs(pip_dir, exist_ok=True)
LAV_TOP, LAV_BOT = (110, 113, 214), (67, 72, 159)
PALE, PALE_EDGE, RECESS, RING = (232, 230, 245), (196, 194, 226), (23, 24, 27), (94, 106, 210)
def lerp(a, b, k): return a + (b - a) * k
R_RECESS, R_IN_MIN, R_IN_MAX = 86, 12, 70
for fi in range(NF):
    tt = fi / PFPS
    fr = Image.new("RGBA", (PIP_W, PIP_H), (0, 0, 0, 0))
    sh = Image.new("RGBA", (PIP_W, PIP_H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([29, 33, PIP_W-29, PIP_H-21], radius=32, fill=(20, 20, 40, 110))
    fr.alpha_composite(sh.filter(ImageFilter.GaussianBlur(5)))
    tile = Image.new("RGBA", (PIP_W, PIP_H), (0, 0, 0, 0))
    mask = Image.new("L", (PIP_W, PIP_H), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([32, 36, PIP_W-32, PIP_H-24], radius=32, fill=255)
    td = ImageDraw.Draw(tile)
    for y in range(36, PIP_H-24):
        k = (y - 36) / (PIP_H - 24 - 36)
        c = tuple(int(a + (b - a) * k) for a, b in zip(LAV_TOP, LAV_BOT)) + (255,)
        td.line([(32, y), (PIP_W-32, y)], fill=c)
    fr.paste(tile, (0, 0), mask)
    d = ImageDraw.Draw(fr, "RGBA")
    CX, CY = PIP_W//2, PIP_H//2 - 4
    d.ellipse([CX-R_RECESS-8, CY-R_RECESS-8, CX+R_RECESS+8, CY+R_RECESS+8], outline=(52, 55, 120, 255), width=4)
    d.ellipse([CX-R_RECESS-2, CY-R_RECESS-2, CX+R_RECESS+2, CY+R_RECESS+2], outline=(158, 156, 205, 255), width=2)
    hg = Image.new("RGBA", (PIP_W, PIP_H), (0, 0, 0, 0))
    hgd = ImageDraw.Draw(hg)
    for rr, cc in [(R_RECESS, (27, 28, 34, 255)), (int(R_RECESS*0.55), RECESS + (255,))]:
        hgd.ellipse([CX-rr, CY-rr, CX+rr, CY+rr], fill=cc)
    fr.alpha_composite(hg)
    r_in = lerp(R_IN_MIN, R_IN_MAX, float(sm2[fi]))
    rot = math.degrees(tt * 1.4) + 40 * float(sm2[fi])
    bl = Image.new("RGBA", (PIP_W, PIP_H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bl)
    for k in range(6):
        a0 = rot + k * 60
        bd.pieslice([CX-R_RECESS+4, CY-R_RECESS+4, CX+R_RECESS-4, CY+R_RECESS-4], a0, a0 + 76, fill=PALE + (255,))
    bd2 = ImageDraw.Draw(bl)
    for k in range(6):
        a = math.radians(rot + k * 60)
        bd2.line([CX + r_in * math.cos(a), CY + r_in * math.sin(a),
                  CX + (R_RECESS-5) * math.cos(a), CY + (R_RECESS-5) * math.sin(a)],
                 fill=PALE_EDGE + (200,), width=2)
    hole = Image.new("L", (PIP_W, PIP_H), 0)
    hd = ImageDraw.Draw(hole)
    hd.ellipse([CX-r_in, CY-r_in, CX+r_in, CY+r_in], fill=255)
    bl.putalpha(Image.composite(Image.new("L", (PIP_W, PIP_H), 0), bl.getchannel("A"), hole))
    fr.alpha_composite(bl)
    d.ellipse([CX-r_in, CY-r_in, CX+r_in, CY+r_in], outline=RING + (200,), width=2)
    fr.save(os.path.join(pip_dir, f"f{fi:04d}.png"))
pip_dur = NF / PFPS
print("pip frames:", NF, "dur", round(pip_dur, 1))

# ---------- 7. overlay PiP + mux narration + bed ----------
final = os.path.join(OUT, "meet-snap.mp4")
pip_st = INTRO_S + 0.15
run([FF, "-v", "error", "-y",
     "-i", base_mp4,
     "-framerate", str(PFPS), "-i", os.path.join(pip_dir, "f%04d.png"),
     "-i", master_wav,
     "-i", bed_wav,
     "-filter_complex",
     f"[1:v]scale={PIP_W}:{PIP_H},fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st={pip_dur-0.45:.2f}:d=0.45:alpha=1,"
     f"setpts=PTS+{pip_st:.2f}/TB[fp];"
     f"[0:v][fp]overlay={PIP_X}:{PIP_Y}:eof_action=repeat:enable='between(t,{pip_st:.2f},{pip_st+pip_dur:.2f})',"
     f"format=yuv420p[v];"
     f"[2:a][3:a]amix=inputs=2:duration=first:normalize=0[a]",
     "-map", "[v]", "-map", "[a]",
     "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
     "-t", f"{base_dur:.3f}", "-movflags", "+faststart",
     final])
print("final duration:", round(dur(final), 2))

# ---------- 8. captions (.vtt, <=84-char cues split at clause bounds) ----------
starts, cum = {}, INTRO_S
for s in SCENES:
    starts[s] = cum
    cum += vo_durs[s] + GAP

def ts(sec):
    h, m = int(sec // 3600), int((sec % 3600) // 60)
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

def wrap2(text, limit=46):
    words, lines, cur = text.split(), [], ""
    for w0 in words:
        if len(cur) + len(w0) + 1 > limit and cur:
            lines.append(cur); cur = w0
        else:
            cur = (cur + " " + w0).strip()
    if cur: lines.append(cur)
    return lines[:2]

def scene_cues(text, st, en):
    parts = [p.strip() for p in re.split(r"(?<=[.!?,;\u2014]) ", text) if p.strip()]
    chunks, cur = [], ""
    for p in parts:
        if len(cur) + len(p) + 1 > 84 and cur:
            chunks.append(cur.strip()); cur = p
        else:
            cur = (cur + " " + p).strip()
    if cur:
        chunks.append(cur)
    total = sum(len(c) for c in chunks)
    out, t = [], st
    for c in chunks:
        d = (en - st) * len(c) / total
        out.append((t, t + d, c)); t += d
    return out

import re
vtt = ["WEBVTT", ""]
n = 0
for s in SCENES:
    for (st, en, chunk) in scene_cues(NARR[s], starts[s], starts[s] + vo_durs[s]):
        n += 1
        vtt += [f"{n}", f"{ts(st)} --> {ts(en)}", "\n".join(wrap2(chunk)), ""]
open(os.path.join(OUT, "meet-snap.vtt"), "w", encoding="utf-8").write("\n".join(vtt))

# chapters.json (cumulative VO offsets, house schema)
ch = [{"title": c["title"], "start": round(starts[c["scenes"][0]], 2),
       "startLabel": f"{int(starts[c['scenes'][0]]//60)}:{int(starts[c['scenes'][0]]%60):02d}"}
      for c in script["video"]["chapters"]]
json.dump(ch, open(os.path.join(VS, "chapters.json"), "w"), indent=2)
print("chapters:", json.dumps(ch))
print("ASSEMBLY COMPLETE:", final)
