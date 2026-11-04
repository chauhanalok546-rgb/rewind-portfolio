#!/usr/bin/env python3
"""Generates the narration with a neural AI voice (Microsoft Edge neural voices through the `edge-tts` package; no account or key).
Usage:  python3 scripts/generate_ai_voice.py   (run with a Python that has edge-tts installed)
Alok's lines: en-IN-PrabhatNeural. ARM-01 lines: en-GB-RyanNeural with a radio/robot filter.
Text of the (public) script is sent to Microsoft's speech service; nothing else leaves the machine."""
import asyncio, json, os, re, subprocess, sys, tempfile
import edge_tts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lipsync
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ["PATH"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public/audio/answers")
script = {"lines":[dict(id=a["id"],speaker="ALOK",text=a["say"]) for a in json.load(open(os.path.join(OUT,"answers.json")))["answers"]]}
ALOK = dict(voice="en-IN-PrabhatNeural", rate="+14%", pitch="+0Hz")
ARM = dict(voice="en-GB-RyanNeural", rate="+10%", pitch="-6Hz")
RADIO = "highpass=f=380,lowpass=f=3400,acompressor=threshold=-24dB:ratio=6,aecho=0.8:0.6:12:0.15,"
CLEAN = "highpass=f=70,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.12,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,equalizer=f=3000:t=q:w=1.2:g=1.5,adelay=70|70,apad=pad_dur=0.1"

async def one(line, sem):
    cfg = ALOK if line["speaker"] == "ALOK" else ARM
    async with sem:
        raw = tempfile.mktemp(suffix=".mp3")
        words = []
        for attempt in range(4):
            try:
                try: com = edge_tts.Communicate(line["text"], cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"], boundary="WordBoundary")
                except TypeError: com = edge_tts.Communicate(line["text"], cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"])
                words = []
                with open(raw, "wb") as f:
                    async for ch in com.stream():
                        if ch["type"] == "audio": f.write(ch["data"])
                        elif ch["type"] == "WordBoundary": words.append((ch["text"], ch["offset"] / 1e7, ch["duration"] / 1e7))
                break
            except Exception as e:
                if attempt == 3: raise
                await asyncio.sleep(1.5 * (attempt + 1))
    flt = (RADIO if line["speaker"] != "ALOK" else "") + CLEAN
    dst = os.path.join(OUT, line["id"] + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", flt, "-ac", "1", "-ar", "44100", "-b:a", "96k", dst], check=True)
    # where the speech starts in the raw file (what silenceremove trims), so the cues land on the processed audio
    sd = subprocess.run(["ffmpeg", "-i", raw, "-af", "silencedetect=n=-48dB:d=0.05", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"silence_end: ([0-9.]+)", sd); onset = float(m.group(1)) if m and "silence_start: 0" in sd else 0.0
    os.remove(raw)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
    line["duration"] = round(dur, 2)
    os.makedirs(os.path.join(OUT, "cues"), exist_ok=True)
    cues = lipsync.words_to_cues(words, shift=-max(0.0, onset - 0.05) + 0.07, total=dur)
    json.dump({"cues": cues}, open(os.path.join(OUT, "cues", line["id"] + ".json"), "w"))
    print(f"ok  {line['id']:8} {dur:5.2f}s")

async def main():
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*(one(l, sem) for l in script["lines"]))
    d=json.load(open(os.path.join(OUT,"answers.json")))
    for a in d["answers"]:
        a["duration"]=next(l["duration"] for l in script["lines"] if l["id"]==a["id"])
    json.dump(d,open(os.path.join(OUT,"answers.json"),"w"),indent=1,ensure_ascii=False)
asyncio.run(main())
