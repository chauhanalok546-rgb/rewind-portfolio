#!/bin/bash
# Turns raw recordings (voice-raw/<id>.webm|wav|m4a|mp3) into the site's narration files.
# Trims leading/trailing silence, cleans low rumble, levels to -16 LUFS, writes public/audio/narration/<id>.mp3
set -e
cd "$(dirname "$0")/.."
export PATH=/opt/homebrew/bin:$PATH
SRC=voice-raw; OUT=public/audio/narration
ARM=" $(python3 -I -c "import json;print(' '.join(l['id'] for l in json.load(open('$OUT/script.json'))['lines'] if l['speaker']=='ARM-01'))") "
mkdir -p "$OUT"
n=0
for f in "$SRC"/*.{webm,wav,m4a,mp3,aiff}; do
  [ -e "$f" ] || continue
  id=$(basename "${f%.*}")
  RADIO=""; case "$ARM" in *" $id "*) RADIO="highpass=f=380,lowpass=f=3400,acompressor=threshold=-24dB:ratio=6,aecho=0.8:0.6:12:0.15,asetrate=44100*0.94,aresample=44100,"; esac
  ffmpeg -y -loglevel error -i "$f" \
    -af "${RADIO}highpass=f=80,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=0.12" \
    -ac 1 -ar 44100 -b:a 96k "$OUT/$id.mp3"
  echo "ok  $id"; n=$((n+1))
done
echo "$n recordings processed"
