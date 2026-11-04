#!/bin/bash
# Renders the five era scenes at 1920x1080, 40 frames each (played forward and back, frame-blended to 24 fps), then encodes them to public/video.
B=/Applications/Blender.app/Contents/MacOS/Blender
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="${1:-/tmp/cinema_frames}"; VID="$HERE/../../public/video"
mkdir -p "$OUT" "$VID"
for i in 1 2 3 4 5; do
  rm -rf "$OUT/scene$i"; mkdir -p "$OUT/scene$i"
  echo "== scene$i"; $B -b --python "$HERE/scene$i.py" -- scene$i "$OUT/scene$i" 1.0 40 2>&1 | grep -E "Error|Traceback|RENDER SECONDS"
  ffmpeg -y -loglevel error -framerate 12 -i "$OUT/scene$i/f_%04d.png" -filter_complex "[0]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,framerate=fps=24[o]" -map "[o]" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -an "$VID/scene$i.new.mp4" && mv "$VID/scene$i.new.mp4" "$VID/scene$i.mp4"
  ls -la "$VID/scene$i.mp4"
done
echo ALL_DONE
