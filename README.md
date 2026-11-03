# Rewind: The Alok Timeline

An interactive, voice-led portfolio. A digital twin of Alok Chauhan greets you in a time-travel lab, asks if you want to travel back through his life, then narrates six scenes in his own recorded voice: Uttarkashi (2015), MDS Uttarkashi (2023 to 2024), Dehradun (2024 to 2026), NST Pune (2026), the future, and back to the present.

Built for the Wispr Flow "Wispr Your Way into Wispr Flow" challenge. Every instruction to the AI that built it was dictated with Wispr Flow.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Developer shortcuts (URL hash): `#dev` (expressions, gestures, camera), `#lobby`, `#ask`, `#transition`, `#film-scene0` to `#film-scene6` (the film from that scene; sound needs one click first).

## How it works

| Part | Where |
| --- | --- |
| 3D stage (lights, platform, rings, teleport dissolve, adaptive resolution) | `src/stage.ts` |
| Avatar runtime (idle life, blink, look-at, 52 ARKit + 15 viseme morph targets, expressions, gestures, audio-driven lip-sync) | `src/avatar/Avatar.ts` |
| Experience state machine (boot, enter, greeting, Yes/No popup, snap and flash) | `src/app/app.ts` |
| The film (one GSAP master timeline, 7 scenes, time tunnel) | `src/film/` |
| Narration (34 recorded lines, captions, gestures) | `src/voice/Narrator.ts`, `public/audio/narration/` |
| Synthesised sound effects and music beds | `src/audio/` |
| Avatar build scripts (Blender, Avaturn export to final GLB) | `blender/scripts/` |
| Recording tools | `tools/record.html`, `tools/review.html`, `scripts/ingest_voice.py` |

The whole film runs without any API calls: narration is static audio, lip-sync is driven by the audio itself.

## Keyboard

Space play/pause, Left/Right previous/next scene, R replay, C captions, S sound, Esc closes the popup.

## Privacy

No camera or microphone is used yet. Nothing is recorded or uploaded.
