import { gsap, h } from './dom'
import { SCENES, type SceneCtx, type SceneDef } from './scenes'
import { stage } from '../stage'
import { sfx } from '../audio/sfx'
import { music, type Mood } from '../audio/music'
import { tunnel } from './tunnel'
import { $, animateYear, log, reduced, setPlace, setSignal, setStatus, setYearInstant } from '../app/hud'

/** The film: ONE GSAP master timeline with a label per scene (scene0 .. scene6), so buttons and keys can jump, pause, skip and replay.
 *  Narration lines are fixed to the timeline (call at each line's start); each scene builds its own visuals on enter. */
const PAD = 0.8, GAP = 0.35, TAIL = 0.6, TRAVEL = 3.0
const { avatar, narrator } = stage
gsap.ticker.lagSmoothing(0)       // keep the timeline in real time, in step with the voice, even when a frame stutters

let master: gsap.core.Timeline | null = null
let current = -1
let live: { els: HTMLElement[]; tl: gsap.core.Timeline } | null = null
let paused = false
let ended = false
const traits: string[] = []
const listeners: { end?: () => void; scene?: (i: number) => void } = {}

const dur = (id: string) => narrator.lines.find((l) => l.id === id)?.duration ?? 3
const lineOffset = (def: SceneDef, i: number) => PAD + def.lines.slice(0, i).reduce((a, id) => a + dur(id) + GAP, 0)
const sceneLen = (def: SceneDef) => lineOffset(def, def.lines.length) + TAIL + (def.extra ?? 0)

/* ---------- trait words and banners ---------- */
function releaseWord(w: string) {
  if (traits.includes(w)) return
  traits.push(w); sfx.chime()
  const props = $('props')
  const big = h(`<div class="bigword">${w}</div>`, props)
  gsap.fromTo(big, { autoAlpha: 0, scale: 0.6, y: 20 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.7, ease: 'back.out(1.6)' })
  const chip = h(`<span class="trait mono">${w}</span>`, $('traits')); gsap.set(chip, { autoAlpha: 0 })
  gsap.delayedCall(1.9, () => {
    const a = big.getBoundingClientRect(), b = chip.getBoundingClientRect()
    gsap.to(big, { x: b.left - a.left, y: b.top - a.top, scale: 0.18, autoAlpha: 0, duration: 0.9, ease: 'power3.inOut', onComplete: () => { big.remove(); gsap.to(chip, { autoAlpha: 1, duration: 0.3 }) } })
  })
}
function banner(text: string, sub = '') {
  const b = h(`<div class="banner2"><b>${text}</b>${sub ? `<span class="mono">${sub}</span>` : ''}</div>`, $('props'))
  gsap.fromTo(b, { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.6 })
  gsap.to(b, { autoAlpha: 0, duration: 0.8, delay: 4.4, onComplete: () => b.remove() })
}

/* ---------- scene lifecycle ---------- */
function disposeScene() {
  if (!live) return
  const { els, tl } = live; live = null
  tl.kill()
  for (const e of els) { gsap.killTweensOf(e); gsap.to(e, { autoAlpha: 0, duration: 0.5, onComplete: () => e.remove() }) }
}

const warmed = new Set<string>()
function prefetch(i: number) {
  for (const id of SCENES[i]?.lines ?? []) { if (warmed.has(id)) continue; warmed.add(id); void fetch(`/audio/narration/${id}.mp3`).catch(() => warmed.delete(id)) }
}

function enterScene(i: number) {
  const def = SCENES[i]
  disposeScene()
  current = i; ended = false
  document.documentElement.dataset.scene = def.id
  prefetch(i); prefetch(i + 1)
  const els: HTMLElement[] = []
  const tl = gsap.timeline()
  live = { els, tl }
  const ctx: SceneCtx = {
    id: def.id, sets: $('sets'), props: $('props'), tl,
    at: (line, off = 0) => lineOffset(def, line) + off,
    add<T extends HTMLElement>(html: string, layer: 'sets' | 'props' = 'props') { const e = h<T>(html, layer === 'sets' ? $('sets') : $('props')); els.push(e); return e },
    word: releaseWord,
    music: (m: Mood) => music.play(m),
    type(el, text, start, d) {
      let pre = ''
      tl.call(() => { pre = el.textContent ?? '' }, [], start)
      const o = { n: 0 }
      tl.to(o, { n: text.length, duration: reduced ? 0.01 : d, ease: 'none', onUpdate: () => { el.textContent = pre + text.slice(0, Math.round(o.n)) } }, start)
    },
    banner,
  }
  // where the avatar stands
  avatar.setAutonomous(def.avatar === 'lobby')
  if (def.id !== 'scene6') stage.machine.setActive(false)
  if (def.avatar === 'lobby') { stage.setLobbyVisible(true, i === 0 ? 0 : 900); stage.setAvatarPose(0, 0, i === 0 ? 0 : 0); if (i > 0) void stage.teleport('in', 1100) }
  else { stage.setLobbyVisible(false, 600); stage.setAvatarPose(innerWidth / innerHeight < 1.0 ? 0 : def.avatar.x * Math.min(1, innerWidth / innerHeight / 1.6), innerWidth / innerHeight < 1.0 ? 0 : def.avatar.yaw, 0); void stage.teleport('in', 1100) }
  void animateYear(def.year, reduced ? 0 : 600)
  setPlace(def.place); setSignal(i === 0 ? '12%' : i === 5 ? '88%' : '100%')
  setStatus('Playing')
  music.play(def.music)
  stage.setAmbience(def.id === 'scene0' || def.id === 'scene6' ? 'lobby' : def.id)
  tunnel.stop(900)
  def.enter(ctx)
  listeners.scene?.(i)
  updateChips()
}

async function travel(from: number, to: number) {
  setStatus('Travelling', true)
  log(`Destination locked: ${SCENES[to].year}`)
  tunnel.start(500); sfx.whoosh(2.2); stage.fx.ringSpeed = 5
  disposeScene()
  void animateYear(SCENES[to].year, reduced ? 0 : 1800)
  if (SCENES[from].avatar !== 'lobby' || from === 0) await stage.teleport('out', 1200)
  stage.fx.ringSpeed = 1
}

/* ---------- master timeline ---------- */
function build() {
  master?.kill()
  const tl = gsap.timeline({ paused: true, onComplete: () => { ended = true; setStatus('Complete'); listeners.end?.() } })
  let t = 0
  SCENES.forEach((def, i) => {
    tl.addLabel(def.id, t)
    tl.call(() => { enterScene(i) }, [], t + 0.001)
    def.lines.forEach((id, k) => tl.call(() => { void narrator.playLine(id) }, [], t + lineOffset(def, k)))
    const len = sceneLen(def)
    if (i < SCENES.length - 1) {
      tl.call(() => { void travel(i, i + 1) }, [], t + len)
      t += len + TRAVEL
    } else t += len + 14                                    // the last scene lingers so the end card can be used
  })
  tl.to({}, { duration: 0.01 }, t - 0.01)                   // makes the timeline last through the final scene's linger time
  master = tl
}

/* ---------- public controls ---------- */
function setPaused(p: boolean) {
  paused = p
  if (p) { gsap.globalTimeline.pause(); avatar.audio?.pause(); sfx.suspend() }
  else { gsap.globalTimeline.resume(); void avatar.audio?.play().catch(() => undefined); sfx.resume() }
  const b = $('c-play'); b.textContent = p ? '▶' : '⏸'; b.setAttribute('aria-label', p ? 'Play' : 'Pause')
}

function chipsInit() {
  const chips = $('chips'); chips.replaceChildren()
  ;[[1, '2015'], [2, '2023'], [3, '2024'], [4, '2026'], [5, '2030']].forEach(([i, y]) => {
    const c = document.createElement('button'); c.className = 'chip'; c.textContent = String(y); c.dataset.i = String(i); c.title = `Jump to: ${SCENES[i as number].place}`
    c.addEventListener('click', () => film.jump(i as number)); chips.appendChild(c)
  })
}
function updateChips() { document.querySelectorAll<HTMLElement>('#chips .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.i) === current)) }

export const film = {
  get current() { return current },
  get running() { return master !== null && !ended },
  onEnd(fn: () => void) { listeners.end = fn },
  begin(startScene = 0) {
    build(); chipsInit()
    document.documentElement.classList.add('film')
    for (const id of ['c-prev', 'c-play', 'c-next']) ($(id) as HTMLButtonElement).disabled = false
    ;($('c-play') as HTMLButtonElement).textContent = '⏸'
    traits.length = 0; $('traits').replaceChildren()
    setPaused(false); gsap.globalTimeline.resume()
    stage.avatar.setExpression('neutral')
    master!.seek(master!.labels[SCENES[startScene].id], true).play()
  },
  jump(i: number) {
    if (!master) return
    const n = Math.max(0, Math.min(SCENES.length - 1, i))
    narrator.stop(); stage.avatar.stop(); disposeScene(); tunnel.stop(300)
    stage.fx.ringSpeed = 1
    void animateYear(SCENES[n].year, reduced ? 0 : 700)
    setPaused(false)
    master.pause().seek(master.labels[SCENES[n].id], true).play()
  },
  next() { film.jump(Math.min(SCENES.length - 1, current + 1)) },
  prev() { film.jump(Math.max(0, current - 1)) },
  toggle() { setPaused(!paused) },
  pause() { setPaused(true) },
  resume() { setPaused(false) },
  get paused() { return paused },
  /** jump to the end card right away: scene 6, fast-forwarded to where the contact cards are visible */
  contact() { film.jump(6); setTimeout(() => { live?.tl.time(lineOffset(SCENES[6], 2) + 2, false) }, 150) },
  replay() { traits.length = 0; $('traits').replaceChildren(); setYearInstant(2026); ended = false; film.jump(0) },
  /** leaves the film and gives the lobby back */
  stop() { master?.kill(); master = null; disposeScene(); narrator.stop(); tunnel.stop(200); document.documentElement.classList.remove('film'); current = -1 },
}
document.addEventListener('film:replay', () => film.replay())

;(window as unknown as Record<string, unknown>).__film = film
