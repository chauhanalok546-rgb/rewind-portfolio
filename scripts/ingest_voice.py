#!/usr/bin/env python3
"""Raw takes (voice-raw/<id>.*) -> public/audio/narration/<id>.mp3.
Finds where the speech really starts and ends from the loudness envelope (relative to the speaker's own level, so a noisy
room tail is not mistaken for speech), then denoises lightly, rolls off rumble, levels to -16 LUFS and writes an MP3.
ARM-01 lines get a radio/robot filter on top."""
import glob, json, math, os, struct, subprocess, sys
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ["PATH"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, "voice-raw"), os.path.join(ROOT, "public/audio/narration")
script = json.load(open(os.path.join(OUT, "script.json")))
arm = {l["id"] for l in script["lines"] if l["speaker"] == "ARM-01"}
RADIO = "highpass=f=380,lowpass=f=3400,acompressor=threshold=-24dB:ratio=6,aecho=0.8:0.6:12:0.15,asetrate=44100*0.94,aresample=44100,"
SR, WIN = 16000, 800            # 50 ms windows

def pcm(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return struct.unpack("<%dh" % (len(raw) // 2), raw)

def envelope(s):
    out = []
    for k in range(0, len(s) - WIN, WIN):
        w = s[k:k + WIN]; out.append(20 * math.log10(max(1e-9, math.sqrt(sum(v * v for v in w) / len(w)) / 32768)))
    return out

def speech_span(env):
    srt = sorted(env); ref = srt[int(len(srt) * 0.9)]          # the speaker's normal level
    thr = ref - 14
    idx = [i for i, v in enumerate(env) if v > thr]
    # ignore isolated blips (clicks, breaths) shorter than 150 ms
    runs, cur = [], []
    for i in idx:
        if cur and i - cur[-1] > 1: runs.append(cur); cur = []
        cur.append(i)
    if cur: runs.append(cur)
    runs = [r for r in runs if len(r) >= 3] or runs
    return runs[0][0], runs[-1][-1], ref, thr

n = 0
for f in sorted(glob.glob(os.path.join(SRC, "*.*"))):
    ext = f.rsplit(".", 1)[-1].lower()
    if ext not in ("webm", "wav", "m4a", "mp3", "aiff", "ogg"): continue
    id_ = os.path.basename(f).rsplit(".", 1)[0]
    env = envelope(pcm(f))
    a, b, ref, thr = speech_span(env)
    start = max(0, a * 0.05 - 0.10); end = (b + 1) * 0.05 + 0.28
    flt = ("afftdn=nr=10:nf=-40," + ("" if id_ not in arm else RADIO) +
           "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11,adelay=70|70,apad=pad_dur=0.1")
    dst = os.path.join(OUT, id_ + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", f, "-af", flt, "-ac", "1", "-ar", "44100", "-b:a", "96k", dst], check=True)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
    for l in script["lines"]:
        if l["id"] == id_: l["duration"] = round(dur, 2)
    print(f"ok  {id_:8} speech {a*0.05:5.1f}-{(b+1)*0.05:5.1f}s of {len(env)*0.05:5.1f}s  ref {ref:5.1f} dB  -> {dur:5.2f}s")
    n += 1
json.dump(script, open(os.path.join(OUT, "script.json"), "w"), indent=1, ensure_ascii=False)
print(n, "recordings processed")
