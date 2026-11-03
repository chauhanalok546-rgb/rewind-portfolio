#!/usr/bin/env python3
"""Generates the narration with a neural AI voice (Microsoft Edge neural voices through the `edge-tts` package; no account or key).
Usage:  python3 scripts/generate_ai_voice.py   (run with a Python that has edge-tts installed)
Alok's lines: en-IN-PrabhatNeural. ARM-01 lines: en-GB-RyanNeural with a radio/robot filter.
Text of the (public) script is sent to Microsoft's speech service; nothing else leaves the machine."""
import asyncio, json, os, subprocess, sys, tempfile
import edge_tts
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ["PATH"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public/audio/narration")
script = json.load(open(os.path.join(OUT, "script.json")))
ALOK = dict(voice="en-IN-PrabhatNeural", rate="+28%", pitch="+0Hz")
ARM = dict(voice="en-GB-RyanNeural", rate="+10%", pitch="-6Hz")
RADIO = "highpass=f=380,lowpass=f=3400,acompressor=threshold=-24dB:ratio=6,aecho=0.8:0.6:12:0.15,"
CLEAN = "highpass=f=70,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.12,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,adelay=70|70,apad=pad_dur=0.1"

async def one(line, sem):
    cfg = ALOK if line["speaker"] == "ALOK" else ARM
    async with sem:
        raw = tempfile.mktemp(suffix=".mp3")
        for attempt in range(4):
            try:
                await edge_tts.Communicate(line["text"], cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"]).save(raw); break
            except Exception as e:
                if attempt == 3: raise
                await asyncio.sleep(1.5 * (attempt + 1))
    flt = (RADIO if line["speaker"] != "ALOK" else "") + CLEAN
    dst = os.path.join(OUT, line["id"] + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", flt, "-ac", "1", "-ar", "44100", "-b:a", "96k", dst], check=True)
    os.remove(raw)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
    line["duration"] = round(dur, 2)
    print(f"ok  {line['id']:8} {dur:5.2f}s")

async def main():
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*(one(l, sem) for l in script["lines"]))
    script["voice"] = {"ALOK": f"AI voice: {ALOK['voice']} (Microsoft neural, via edge-tts)", "ARM-01": f"AI voice: {ARM['voice']} with a radio filter"}
    json.dump(script, open(os.path.join(OUT, "script.json"), "w"), indent=1, ensure_ascii=False)
    print("total", round(sum(l["duration"] for l in script["lines"])), "s")
asyncio.run(main())
