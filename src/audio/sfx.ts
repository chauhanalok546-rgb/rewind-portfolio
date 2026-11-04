/** Small synthesised sound effects (no audio files): snap, whoosh, chime, beep, lab hum. One shared master gain for mute. */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let hum: { stop: () => void } | null = null
let muted = false

function ensure() {
  if (!ctx) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination) }
  return ctx
}
const noise = (c: AudioContext, seconds: number) => {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate); const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource(); s.buffer = b; return s
}

export function audioGraph() { const c = ensure(); return { ctx: c, master: master! } }

export const sfx = {
  /** Must be called from a click: unlocks audio and starts the faint lab hum. */
  unlock() { const c = ensure(); if (c.state === 'suspended') void c.resume(); this.startHum() },
  suspend() { if (ctx && ctx.state === 'running') void ctx.suspend() },
  resume() { if (ctx && ctx.state === 'suspended') void ctx.resume() },
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
  /** a finger snap: a sharp dry click, a hollow "pop" from the palm, and a short ring in the room */
  snap() {
    const c = ensure(); if (!master) return
    const t0 = c.currentTime
    const click = noise(c, 0.05), hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200
    const cg = c.createGain(); cg.gain.setValueAtTime(1.2, t0); cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.028)
    click.connect(hp); hp.connect(cg); cg.connect(master); click.start(t0)
    const pop = c.createOscillator(); pop.type = 'triangle'; pop.frequency.setValueAtTime(900, t0); pop.frequency.exponentialRampToValueAtTime(260, t0 + 0.07)
    const pf = c.createBiquadFilter(); pf.type = 'bandpass'; pf.frequency.value = 1100; pf.Q.value = 3
    const pg = c.createGain(); pg.gain.setValueAtTime(0.9, t0); pg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09)
    pop.connect(pf); pf.connect(pg); pg.connect(master); pop.start(t0); pop.stop(t0 + 0.1)
    const body = noise(c, 0.2), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 6
    const bg = c.createGain(); bg.gain.setValueAtTime(0.35, t0 + 0.004); bg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2)
    body.connect(bp); bp.connect(bg); bg.connect(master); body.start(t0)
  },
  /** a vehicle passing: a pitch-dropping whoosh that pans from one side to the other (dir 1 = left to right) */
  flyby(dir = 1) {
    const c = ensure(); if (!master) return
    const t0 = c.currentTime, d = 2.4
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(230, t0); o.frequency.exponentialRampToValueAtTime(120, t0 + d)
    const n = noise(c, d), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(260, t0 + d)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + d * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d)
    const pan = c.createStereoPanner(); pan.pan.setValueAtTime(-0.8 * dir, t0); pan.pan.linearRampToValueAtTime(0.8 * dir, t0 + d)
    o.connect(lp); lp.connect(g); n.connect(bp); bp.connect(g); g.connect(pan); pan.connect(master); o.start(t0); o.stop(t0 + d); n.start(t0)
  },
  /** the time-warp: a rising riser into a deep impact; `lead` seconds of build-up, then the boom */
  warp(lead = 1.2) {
    const c = ensure(); if (!master) return
    const t0 = c.currentTime
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + lead)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(6000, t0 + lead)
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + lead); g.gain.exponentialRampToValueAtTime(0.0001, t0 + lead + 0.25)
    o.connect(lp); lp.connect(g); g.connect(master); o.start(t0); o.stop(t0 + lead + 0.3)
    const sw = noise(c, lead + 0.3), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(400, t0); bp.frequency.exponentialRampToValueAtTime(7000, t0 + lead)
    const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.4, t0 + lead); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + lead + 0.3)
    sw.connect(bp); bp.connect(sg); sg.connect(master); sw.start(t0)
    const t1 = t0 + lead                                           // impact
    const k = c.createOscillator(); k.type = 'sine'; k.frequency.setValueAtTime(120, t1); k.frequency.exponentialRampToValueAtTime(34, t1 + 0.6)
    const kg = c.createGain(); kg.gain.setValueAtTime(0.0001, t1); kg.gain.exponentialRampToValueAtTime(0.9, t1 + 0.01); kg.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.9)
    k.connect(kg); kg.connect(master); k.start(t1); k.stop(t1 + 1)
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
