import { audioGraph, sfx } from './sfx'

export type Mood = 'lab' | 'glitch' | 'piano' | 'strings' | 'crowd' | 'silence' | 'lift' | 'beat' | 'swell' | 'calm'

/** Tiny generative music beds (synthesised, no files). Sits under the voice and ducks 6 dB while anyone speaks. */
let bus: GainNode | null = null
let current: { stop: () => void } | null = null
let duckTimer = 0
let barge = false
let isSpeaking: () => boolean = () => false

const noiseSrc = (c: AudioContext) => {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource(); s.buffer = b; s.loop = true; return s
}
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function pad(c: AudioContext, out: AudioNode, notes: number[], cutoff: number, gain: number, rise = 3) {
  const g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(gain, c.currentTime + rise)
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.6
  const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = cutoff * 0.25; lfo.connect(lg); lg.connect(lp.frequency); lfo.start()
  const oscs: OscillatorNode[] = []
  for (const n of notes) for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det; o.connect(lp); o.start(); oscs.push(o) }
  lp.connect(g); g.connect(out)
  return () => { g.gain.setTargetAtTime(0, c.currentTime, 0.5); setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop() }, 2500) }
}
function pluck(c: AudioContext, out: AudioNode, midi: number, vel = 0.12) {
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi)
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi) * 2
  const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(vel, c.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, c.currentTime + 1.6)
  o.connect(g); o2.connect(g); g.connect(out); o.start(); o2.start(); o.stop(c.currentTime + 1.7); o2.stop(c.currentTime + 1.7)
}
function loop(ms: number, fn: (i: number) => void) { let i = 0; const id = window.setInterval(() => fn(i++), ms); return () => clearInterval(id) }

const BEDS: Record<Mood, (c: AudioContext, out: AudioNode) => () => void> = {
  lab: (c, out) => pad(c, out, [45, 52, 57], 380, 0.05),
  glitch: (c, out) => { const stopPad = pad(c, out, [38, 45], 260, 0.06); const stopT = loop(900, () => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 300 + Math.random() * 900; const g = c.createGain(); g.gain.setValueAtTime(0.03, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0005, c.currentTime + 0.07); o.connect(g); g.connect(out); o.start(); o.stop(c.currentTime + 0.08) }); return () => { stopPad(); stopT() } },
  piano: (c, out) => { const seq = [60, 64, 67, 72, 67, 64, 62, 65, 69, 74, 69, 65]; const stop = loop(560, (i) => pluck(c, out, seq[i % seq.length], 0.1)); const stopPad = pad(c, out, [48, 55], 500, 0.025); return () => { stop(); stopPad() } },
  strings: (c, out) => { const stopPad = pad(c, out, [52, 59, 64], 900, 0.05, 6); const src = noiseSrc(c); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7; const g = c.createGain(); g.gain.value = 0.02; src.connect(bp); bp.connect(g); g.connect(out); src.start(); return () => { stopPad(); g.gain.setTargetAtTime(0, c.currentTime, 0.4); setTimeout(() => src.stop(), 2000) } },
  crowd: (c, out) => { const src = noiseSrc(c); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.4; const g = c.createGain(); g.gain.value = 0.0; g.gain.linearRampToValueAtTime(0.06, c.currentTime + 2); src.connect(bp); bp.connect(g); g.connect(out); src.start(); const stopSw = loop(1400, () => g.gain.setTargetAtTime(0.03 + Math.random() * 0.05, c.currentTime, 0.4)); return () => { stopSw(); g.gain.setTargetAtTime(0, c.currentTime, 0.2); setTimeout(() => src.stop(), 1200) } },
  silence: () => () => {},
  lift: (c, out) => { const stopPad = pad(c, out, [48, 55, 60, 64], 700, 0.05, 4); const seq = [60, 67, 72, 76]; const stop = loop(800, (i) => pluck(c, out, seq[i % 4], 0.07)); return () => { stopPad(); stop() } },
  beat: (c, out) => {
    const stopB = loop(480, (i) => {
      const o = c.createOscillator(); o.frequency.setValueAtTime(140, c.currentTime); o.frequency.exponentialRampToValueAtTime(45, c.currentTime + 0.12)
      const g = c.createGain(); g.gain.setValueAtTime(i % 2 ? 0.0 : 0.22, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2); o.connect(g); g.connect(out); o.start(); o.stop(c.currentTime + 0.22)
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = mtof([36, 36, 39, 34][Math.floor(i / 2) % 4]); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300
      const g2 = c.createGain(); g2.gain.setValueAtTime(0.06, c.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4); o2.connect(lp); lp.connect(g2); g2.connect(out); o2.start(); o2.stop(c.currentTime + 0.42)
    })
    const stopK = loop(130, () => { if (Math.random() < 0.5) return; const n = noiseSrc(c); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; const g = c.createGain(); g.gain.setValueAtTime(0.04, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0005, c.currentTime + 0.03); n.connect(hp); hp.connect(g); g.connect(out); n.start(); n.stop(c.currentTime + 0.04) })
    return () => { stopB(); stopK() }
  },
  swell: (c, out) => pad(c, out, [43, 50, 55, 62], 1200, 0.07, 10),
  calm: (c, out) => { const stopPad = pad(c, out, [48, 55, 59], 500, 0.045, 3); const seq = [67, 71, 74]; const stop = loop(1400, (i) => pluck(c, out, seq[i % 3], 0.06)); return () => { stopPad(); stop() } },
}

export const music = {
  setSpeakingProbe(fn: () => boolean) { isSpeaking = fn },
  /** the visitor is talking over us: music right down */
  setBarge(v: boolean) { barge = v },
  play(mood: Mood) {
    const { ctx, master } = audioGraph()
    if (!bus) { bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master) }
    current?.stop()
    const sub = ctx.createGain(); sub.gain.value = 1; sub.connect(bus)
    const stop = BEDS[mood](ctx, sub)
    current = { stop: () => { stop(); sub.gain.setTargetAtTime(0, ctx.currentTime, 0.4) } }
    if (!duckTimer) duckTimer = window.setInterval(() => { if (bus) bus.gain.setTargetAtTime(barge ? 0.12 : isSpeaking() ? 0.5 : 1, ctx.currentTime, 0.12) }, 120)
  },
  stop() { current?.stop(); current = null },
  get muted() { return sfx.muted },
}
