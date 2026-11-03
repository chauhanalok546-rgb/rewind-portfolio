/** Small synthesised sound effects (no audio files): snap, whoosh, chime, beep, lab hum. One shared master gain for mute. */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let hum: { stop: () => void } | null = null
let muted = false

function ensure() {
  if (!ctx) { ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination) }
  return ctx
}
const noise = (c: AudioContext, seconds: number) => {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate); const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource(); s.buffer = b; return s
}

export const sfx = {
  /** Must be called from a click: unlocks audio and starts the faint lab hum. */
  unlock() { const c = ensure(); if (c.state === 'suspended') void c.resume(); this.startHum() },
  setMuted(m: boolean) { muted = m; if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05) },
  get muted() { return muted },
  startHum() {
    const c = ensure(); if (hum || !master) return
    const g = c.createGain(); g.gain.value = 0.0; g.gain.linearRampToValueAtTime(0.03, c.currentTime + 2.5)
    const o1 = c.createOscillator(); o1.frequency.value = 55; const o2 = c.createOscillator(); o2.frequency.value = 82.5; o2.type = 'triangle'
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o1.start(); o2.start()
    hum = { stop: () => { g.gain.setTargetAtTime(0, c.currentTime, 0.4); setTimeout(() => { o1.stop(); o2.stop() }, 1500); hum = null } }
  },
  stopHum() { hum?.stop() },
  snap() {
    const c = ensure(); if (!master) return
    const n = noise(c, 0.12), hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2800; hp.Q.value = 1.4
    const g = c.createGain(); g.gain.setValueAtTime(0.9, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.09)
    n.connect(hp); hp.connect(g); g.connect(master); n.start()
    const o = c.createOscillator(); o.frequency.setValueAtTime(220, c.currentTime); o.frequency.exponentialRampToValueAtTime(70, c.currentTime + 0.05)
    const og = c.createGain(); og.gain.setValueAtTime(0.5, c.currentTime); og.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06)
    o.connect(og); og.connect(master); o.start(); o.stop(c.currentTime + 0.08)
  },
  whoosh(seconds = 1.4) {
    const c = ensure(); if (!master) return
    const n = noise(c, seconds), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9
    bp.frequency.setValueAtTime(180, c.currentTime); bp.frequency.exponentialRampToValueAtTime(3200, c.currentTime + seconds * 0.8)
    const g = c.createGain(); g.gain.setValueAtTime(0.0, c.currentTime); g.gain.linearRampToValueAtTime(0.55, c.currentTime + seconds * 0.6); g.gain.linearRampToValueAtTime(0, c.currentTime + seconds)
    n.connect(bp); bp.connect(g); g.connect(master); n.start()
  },
  chime() {
    const c = ensure(); if (!master) return
    for (const [f, d] of [[880, 0], [1318, 0.09]] as const) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f
      const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime + d); g.gain.linearRampToValueAtTime(0.18, c.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + 1.3)
      o.connect(g); g.connect(master); o.start(c.currentTime + d); o.stop(c.currentTime + d + 1.4)
    }
  },
  beep() {
    const c = ensure(); if (!master) return
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 520
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.linearRampToValueAtTime(0.12, c.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18)
    o.connect(lp); lp.connect(g); g.connect(master); o.start(); o.stop(c.currentTime + 0.2)
  },
}
