#!/usr/bin/env python3
"""Regenerates Alok's narration (and optionally the 15 canned answers) with an ElevenLabs voice.
Usage (run it yourself so the key stays on your machine; it is read from the environment and never written anywhere):
  ELEVENLABS_API_KEY=... python3 scripts/generate_elevenlabs_voice.py            # narration, Alok's lines only (ARM-01 keeps its radio voice)
  ELEVENLABS_API_KEY=... python3 scripts/generate_elevenlabs_voice.py --answers  # the canned Ask Alok answers
Optional: ELEVENLABS_VOICE_ID (default below), ELEVENLABS_MODEL (default eleven_multilingual_v2).
Needs ffmpeg. Text of the public script is sent to ElevenLabs; nothing else leaves the machine."""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lipsync
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ["PATH"]
def _env_file():
    """read KEY=value lines from rewind/.env.local (git-ignored) so the key never has to be typed into a command or a chat"""
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
    if os.path.exists(p):
        for ln in open(p):
            if "=" in ln and not ln.lstrip().startswith("#"):
                k, v = ln.strip().split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
_env_file()
KEY = os.environ.get("ELEVENLABS_API_KEY")
VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "4N8zjn9tVNuDEBFWVHAq")
MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
if not KEY: sys.exit("No key found: put ELEVENLABS_API_KEY=... in rewind/.env.local (or the environment).")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANSWERS = "--answers" in sys.argv
ONLY = [a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")]
ONLY = ONLY[0] if ONLY else None          # --only=s1_2,s3_1 regenerates just those narration lines (saves the free quota)
LISTEN = "--listen" in sys.argv
OUT = os.path.join(ROOT, "public/audio/listen" if LISTEN else "public/audio/answers" if ANSWERS else "public/audio/narration")
CLEAN = "highpass=f=70,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.12,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,adelay=70|70,apad=pad_dur=0.1"

def tts(text):
    body = json.dumps({"text": text, "model_id": MODEL, "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": True}}).encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128", body, {"xi-api-key": KEY, "content-type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (401, 402, 403, 404): sys.exit(f"ElevenLabs refused ({e.code}): {msg}")   # key, plan or voice problem: stop early
            if attempt == 2: sys.exit(f"ElevenLabs error {e.code}: {msg}")
            time.sleep(2 * (attempt + 1))

def render(id_, text):
    resp = tts(text); raw = tempfile.mktemp(suffix=".mp3"); open(raw, "wb").write(base64.b64decode(resp["audio_base64"]))
    al = resp.get("alignment") or {}
    words = lipsync.chars_to_words(al.get("characters", []), al.get("character_start_times_seconds", []), al.get("character_end_times_seconds", []))
    import re
    sd = subprocess.run(["ffmpeg", "-i", raw, "-af", "silencedetect=n=-48dB:d=0.05", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"silence_end: ([0-9.]+)", sd); onset = float(m.group(1)) if m and "silence_start: 0" in sd else 0.0
    dst = os.path.join(OUT, id_ + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", CLEAN, "-ac", "1", "-ar", "44100", "-b:a", "96k", dst], check=True)
    os.remove(raw)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
    os.makedirs(os.path.join(OUT, "cues"), exist_ok=True)
    json.dump({"cues": lipsync.words_to_cues(words, shift=-max(0.0, onset - 0.05) + 0.07, total=dur)}, open(os.path.join(OUT, "cues", id_ + ".json"), "w"))
    print(f"ok  {id_:10} {dur:5.2f}s"); return round(dur, 2)

if LISTEN:
    p = os.path.join(OUT, "phrases.json"); d = json.load(open(p))
    for l in d["lines"]: l["duration"] = render(l["id"], l["text"])
    json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)
elif ANSWERS:
    p = os.path.join(OUT, "answers.json"); d = json.load(open(p))
    for a in d["answers"]: a["duration"] = render(a["id"], a["say"])
    d["voice"] = f"ElevenLabs {VOICE}"; json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)
else:
    p = os.path.join(OUT, "script.json"); d = json.load(open(p))
    for l in d["lines"]:
        if l["speaker"] == "ALOK" and (not ONLY or l["id"] in ONLY): l["duration"] = render(l["id"], l["text"])
    d["voice"]["ALOK"] = f"ElevenLabs voice {VOICE}"; json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)
print("done")
