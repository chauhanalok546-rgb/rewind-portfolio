import * as THREE from 'three'
import { fx, loadStage, stage, type Theme } from '../stage'
import { film } from '../film/film'
import { $, decay, hide, log, reduced, setStatus, shockwave, show, wait, whiteFlash } from './hud'
import { tunnel } from '../film/tunnel'
import { music } from '../audio/music'
import gsap from 'gsap'
import { sfx } from '../audio/sfx'
import { mountStickers, toast } from '../ui/stickers'
import { startPresence, type Presence } from '../sense/presence'
import { Recognizer, voiceSupported } from '../voice/recognizer'
import { parseCommand } from '../voice/parse'
import { initAsk } from './ask'
import { isEcho, looksLikeQuestion, wakeFragment, wakePhrase } from '../voice/question'

/** The experience as an explicit state machine:  BOOT → ENTER → LOBBY → PRESENCE → GREETING → ASK → TRANSITION → ARRIVED
 *  (the film itself arrives in the next phase).  Any state can be jumped to with a URL hash, e.g. #ask or #lobby. */
export type State = 'BOOT' | 'ENTER' | 'LOBBY' | 'PRESENCE' | 'GREETING' | 'ASK' | 'TRANSITION' | 'FILM' | 'END'

const { avatar, narrator } = stage

let state: State = 'BOOT'
let askAnswered = false
let captionsOn = true
let busy = false
export const getState = () => state
function setState(s: State) { state = s; document.documentElement.dataset.state = s }

/* ---------- small UI helpers ---------- */
function typeInto(el: HTMLElement, text: string, speed = 24): Promise<void> {
  return new Promise((resolve) => {
    let i = 0
    const step = () => {
      if (reduced || document.hidden) { el.textContent += text.slice(i); resolve(); return }   // no typewriter in background tabs or reduced motion
      el.textContent += text[i++] ?? ''; if (i < text.length) setTimeout(step, reduced || document.hidden ? 0 : speed); else resolve() }
    step()
  })
}
const spoken: { t: number; text: string }[] = []     // what he said out loud lately: anything the mic hears that matches it is his own voice coming back in
let lastSpoke = 0
setInterval(() => { if (avatar.isSpeaking()) lastSpoke = performance.now() }, 150)
function caption(text: string | null, speaker?: string) {
  const el = $('sub')
  if (text && !text.startsWith('You: ')) { spoken.push({ t: performance.now(), text }); while (spoken.length > 6) spoken.shift() }
  if (!text) { el.classList.remove('on'); return }
  el.textContent = speaker === 'ARM-01' ? `ARM-01: ${text}` : text
  el.classList.add('on')
}
narrator.onCaption = (t, l) => caption(t, l?.speaker)

async function boot() {
  setState('BOOT')
  const log$ = $('bootlog'), bar = $('bootbar')
  const started = performance.now()
  const loading = loadStage((f) => { bar.style.width = Math.round(f * 100) + '%' })
  await typeInto(log$, 'booting alok.os v18\n'); await typeInto(log$, 'calibrating robotic arm ✓\n'); await typeInto(log$, 'loading avatar …')
  try { await loading } catch (e) { log$.textContent += `\nfailed: ${e}\nthe classic portfolio is linked at the bottom of the page`; throw e }
  bar.style.width = '100%'
  await wait(Math.max(0, 1400 - (performance.now() - started)))
  log$.textContent += ' ✓'
  await wait(350)
  hide('boot')
  enter()
}

let cameraReady: Promise<Presence> | null = null
let skipEnter = false          // development jumps (#lobby, #ask, #transition, #film-sceneN) skip the Enter card
function enter() {
  if (skipEnter) return
  setState('ENTER')
  show('enter')
  const btn = $('enter-btn'); btn.focus()
  btn.addEventListener('click', () => {
    sfx.unlock()                                   // the click unlocks sound ...
    cameraReady = startPresence()                  // ... and asks for the camera (only to notice that someone is here)
    void cameraReady.then(() => startVoice())      // then voice commands, so the two permission prompts do not collide
    hide('enter'); lobby()
  }, { once: true })
}

async function lobby() {
  setState('LOBBY')
  $('app').classList.remove('hidden')
  setStatus('Standby')
  avatar.setAutonomous(true)                       // from now on the twin wanders, glances around and gestures by itself
  log('Audio channel open ✓')
  await wait(2400)                                 // the avatar idles and glances around first
  void presence()
}

/** PRESENCE: wait (up to 10 s) until a face is held steady for about a second; no camera means we greet right away. */
async function presence() {
  setState('PRESENCE')
  let cam: Presence | null = null
  if (cameraReady) {
    const pending = cameraReady
    cam = await Promise.race([pending, wait(15000).then(() => null)])      // never wait forever on a permission prompt
    if (!cam) void pending.then((late) => late.stop())
  }
  if (cam && cam.result === 'watching') {
    log('Camera ready ✓')
    const seen = await cam.waitForFace(1000, 10000, (x, y) => avatar.lookAtVisitor((0.5 - x) * 0.7, (0.5 - y) * 0.4, 9000))
    log(seen ? 'Face detected ✓' : 'No face seen, starting anyway')
    cam.stop(); log('Camera off ✓')                 // the camera is turned off once the greeting starts
    if (seen) { avatar.lookAtVisitor(0, 0.05, 9000); await wait(600) }
  } else {
    log(cam && cam.result === 'denied' ? 'Camera declined, skipping detection' : 'No camera, skipping detection')
    log('Visitor connected ✓')
  }
  avatar.setExpression('happy')
  await wait(500)
  void greeting()
}

async function greeting() {
  setState('GREETING')
  await narrator.playSequence(['greet_1'])
  // "... Say hi, Ringo."  Ringo barks right as the line ends: a yap, the head snapping up, a little hop and the bark sound
  const ringo = narrator.lines.find((l) => l.id === 'greet_ringo')
  const barkTimer = setTimeout(() => { stage.dog.bark(); sfx.bark(); stage.dog.alert() }, Math.max(0, ((ringo?.duration ?? 8) - 0.3) * 1000))
  await narrator.playSequence(['greet_ringo'], 0)
  clearTimeout(barkTimer)
  await wait(1000)
  await narrator.playSequence(['greet_2'])
  avatar.setExpression('neutral')
  ask()
}

/* ---------- voice commands ---------- */
const recognizer = new Recognizer()
function heard(text: string) {
  const el = document.createElement('div'); el.className = 'heard'; el.textContent = `“${text.trim()}”`
  document.getElementById('app')!.appendChild(el); setTimeout(() => el.remove(), 2500)
}
let lastWake = 0
/** The wake phrase, heard either mid-sentence (interim = true: he reacts at once, even while talking) or once the sentence is finished. */
function onWake(text: string, interim: boolean): boolean {
  if (!askApi || ['BOOT', 'ENTER', 'TRANSITION'].includes(state)) return false
  const rest = wakePhrase(text); if (rest === null) return false
  const now = performance.now()
  if (interim) { if (!askApi.isListening() && now - lastWake > 2500) { lastWake = now; log('Voice: wake phrase'); askApi.listen() } return true }
  heard(text)
  const cmd = rest ? parseCommand(rest, filmCtx()) : null
  if (cmd) { lastWake = now; askApi.cancel(); runCommand(cmd, rest); return true }                   // "Hey Alok, pause" / "next" / "twenty twenty four"
  if (rest.split(' ').filter(Boolean).length >= 3) { lastWake = now; void askApi.ask(rest) }       // the question came with the wake phrase
  else if (!askApi.isListening() && now - lastWake > 2500) { lastWake = now; log('Voice: wake phrase'); askApi.listen() }
  return true
}
let askCapture: ((t: string) => void) | null = null   // set while the Ask Alok panel waits for a dictated question
function handleSpeech(text: string) {
  if (askCapture) { const f = askCapture; askCapture = null; f(text); return }
  // "Hey Alok, listen": wake him; if a question follows in the same breath he answers it straight away
  if (askApi && !['BOOT', 'ENTER', 'TRANSITION'].includes(state)) {
    if (onWake(text, false)) return
    if (askApi.isListening()) {                                           // he is listening: the next thing said is the question
      if (!askApi.ready()) return                                         // still saying "Yes, I'm listening": that is his own voice in the mic
      const words = text.trim().split(/\s+/).filter(Boolean)
      const c2 = words.length <= 4 ? parseCommand(text, filmCtx()) : null
      if (c2) { askApi.cancel(); runCommand(c2, text); return }                                    // while he listens, "next" / "pause" work too
      if (words.length >= 2 && !isEcho(text, spoken.slice(-3).map((s) => s.text))) { heard(text); void askApi.ask(text.trim()) }
      return
    }
  }
  // Without his name he only takes the Yes / No answer to "Travel back in time?". Every other voice command needs "Hey Alok, ..." first,
  // so other people talking nearby, a TV or any noise can never pause, skip or jump the story.
  if (state === 'ASK') { const c = parseCommand(text, { asking: true, inFilm: false }); if (c) runCommand(c, text) }
  else if (!WAKE_REQUIRED) handsFreeQuestion(text)
}
const filmCtx = () => ({ asking: state === 'ASK', inFilm: state === 'FILM' || state === 'END' })
function runCommand(cmd: NonNullable<ReturnType<typeof parseCommand>>, text: string) {
  heard(text); log(`Voice: ${cmd.type}${cmd.type === 'year' ? ' ' + cmd.year : ''}`)
  switch (cmd.type) {
    case 'yes': void sayYes(); break
    case 'no': sayNo(); break
    case 'pause': film.pause(); break
    case 'play': film.resume(); break
    case 'next': film.next(); break
    case 'prev': film.prev(); break
    case 'replay': film.replay(); break
    case 'contact': film.contact(); break
    case 'showme': document.dispatchEvent(new CustomEvent('film:decode')); break
    case 'year': film.jump(cmd.scene); break
  }
}
/** Hands-free: a question spoken to him is answered on his own (the world pauses, he answers, the world carries on). Ignored while he is
 *  talking, for a moment after, and whenever the words are just his own voice coming back through the speakers. */
let askApi: { ask: (q: string) => Promise<void>; listen: () => void; isListening: () => boolean; ready: () => boolean; cancel: () => void } | null = null
const WAKE_REQUIRED = true      // true: he only answers after "Hey Alok, listen" (or a question that starts with "Hey Alok"); false: any clear question also works
function handsFreeQuestion(text: string) {
  if (!askApi || ['BOOT', 'ENTER', 'TRANSITION'].includes(state)) return
  if (!looksLikeQuestion(text)) return
  const now = performance.now()
  if (avatar.isSpeaking() || now - lastSpoke < 1600) return
  if (isEcho(text, spoken.filter((s) => now - s.t < 25000).map((s) => s.text))) return
  heard(text); log(`Voice question: ${text.slice(0, 50)}`)
  void askApi.ask(text.trim())
}
/** a small live read-out of what the microphone is hearing, so the visitor can see he is listening and whether the words are coming through */
let hearTimer: ReturnType<typeof setTimeout> | undefined
function showHearing(text: string) {
  let el = document.getElementById('heardlive')
  if (!el) { el = document.createElement('div'); el.id = 'heardlive'; el.className = 'heardlive mono'; document.getElementById('app')!.appendChild(el) }
  el.textContent = '🎧 ' + text.trim().slice(-70); el.classList.add('on')
  clearTimeout(hearTimer); hearTimer = setTimeout(() => el!.classList.remove('on'), 2200)
}
/** only when the START of "Hey Alok" is recognised does his voice dip a little (and returns on its own): noise and other talk never do this */
let duckTimer: ReturnType<typeof setTimeout> | undefined
function softDuck() {
  avatar.setDuck(0.25); music.setBarge(true)
  clearTimeout(duckTimer); duckTimer = setTimeout(() => { avatar.setDuck(1); music.setBarge(false) }, 2200)
}
let voiceStarted = false
function handleInterim(t: string) { showHearing(t); if (wakeFragment(t)) softDuck(); if (!askCapture) onWake(t, true) }
function startVoice() {
  if (voiceStarted) return
  if (!voiceSupported) { toast('Voice talk needs Chrome, Edge or Safari. The buttons do everything.'); return }
  voiceStarted = true
  const mic = $('c-mic') as HTMLButtonElement
  mic.disabled = false; mic.title = 'Say “Hey Alok, listen” and ask him anything. He only reacts when addressed: “Hey Alok, pause / skip / back / replay / contact” (M)'
  recognizer.onFinal = handleSpeech
  recognizer.onInterim = handleInterim
  recognizer.onState = (st) => {
    const on = st === 'listening'
    mic.classList.toggle('listening', on); mic.setAttribute('aria-pressed', String(on))
    document.documentElement.dataset.voice = on ? 'on' : 'off'
    if (on && !mic.dataset.logged) {
      mic.dataset.logged = '1'; log('Microphone listening ✓'); toast('Say “Hey Alok, listen” to ask me anything, even while I am talking')
    }
    if (st === 'blocked') { mic.disabled = true; mic.title = 'Microphone blocked: buttons do everything'; log('Microphone declined'); toast('Microphone is blocked here. Open the site in Chrome and allow the mic to talk to Alok.') }
  }
  recognizer.start()
  mic.addEventListener('click', () => recognizer.toggle())
}

function startListening(onText: (t: string) => void) {
  if (!voiceSupported || recognizer.state === 'blocked') return false
  askCapture = onText; recognizer.onFinal = handleSpeech
  if (!recognizer.listening) recognizer.start()
  setTimeout(() => { askCapture = null }, 15000)
  return true
}

/* ---------- the Yes / No popup ---------- */
function ask() {
  if (busy) return
  setState('ASK')
  askAnswered = false
  show('ask'); $('ask-yes').focus()
  $('c-time').classList.remove('pulse')
}
function closeAsk() { hide('ask') }
function sayNo() {
  if (askAnswered) return
  askAnswered = true; closeAsk()
  setState('LOBBY'); log('Trip postponed')
  $('c-time').classList.add('pulse')              // the time-machine button stays available
}
async function sayYes() {
  if (askAnswered) return
  askAnswered = true; closeAsk()
  await transition()
}

async function transition() {
  busy = true
  setState('TRANSITION')
  log('Signal locked: origin 2030')
  setStatus('Travelling', true)
  await narrator.playLine('yes_1')                 // "Great. Stay close to the platform."
  await wait(250)

  const snapped = new Promise<void>((resolve) => {
    avatar.onEvent = (name) => { if (name === 'snap') { avatar.onEvent = undefined; resolve() } }
    avatar.play('snap')
  })
  await snapped                                    // fingers slip: crisp snap
  sfx.snap(); avatar.blinkNow(0.5); shockwave(); stage.dog.alert()      // the snap: a crisp click and rings of light from him
  fx.flare = 1; fx.chrono = 1; decay('chrono', 2600)  // chronometer flares, rings flare
  fx.ringSpeed = 5; fx.motes = 4
  await wait(reduced ? 80 : 520)                     // a beat to let the snap land ...

  sfx.warp(1.3); tunnel.start(500)                   // ... then the time-warp: riser, streaks, the lens stretches
  if (!reduced) gsap.to(fx, { warp: 1, duration: 1.3, ease: 'power2.in' })
  await wait(reduced ? 200 : 1300)
  await whiteFlash(async () => {                    // at the flash peak the scene swaps behind the light
    sfx.stopHum(); hide('ask', 10); film.begin(0)         // the film starts behind the fading light
    gsap.to(fx, { warp: 0, duration: 0.9, ease: 'power3.out' })
  })
  decay('flare', 1600)
  fx.ringSpeed = 1; fx.motes = 1
  setState('FILM'); busy = false
  film.onEnd(() => setState('END'))
}

/* ---------- controls ---------- */
function wireControls() {
  $('ask-yes').addEventListener('click', () => void sayYes())
  $('ask-no').addEventListener('click', sayNo)
  $('c-time').addEventListener('click', () => { if (state === 'LOBBY') ask() })
  const toggle = (id: string, on: (v: boolean) => void) => { const b = $(id); b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); b.classList.toggle('on', v); on(v) }) }
  toggle('c-cc', (v) => { captionsOn = v; $('sub').classList.toggle('off', !v) })
  toggle('c-snd', (v) => { sfx.setMuted(!v); avatar.setMuted(!v); $('c-snd').textContent = v ? '🔊' : '🔇' })
  const LEVELS = [1, 1.22, 1.45]
  const cycleZoom = () => { const i = (LEVELS.indexOf(stage.getZoom()) + 1) % LEVELS.length; stage.setZoom(LEVELS[i]); toast(i === 0 ? 'Zoom: fit' : `Zoom out ${i}`) }
  $('c-zoom').addEventListener('click', cycleZoom)
  $('c-theme').addEventListener('click', () => stage.setTheme((stage.getTheme() === 'cinematic' ? 'lab' : 'cinematic') as Theme))
  addEventListener('keydown', (e) => {
    if (state === 'FILM' || state === 'END') {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('button,a')) { e.preventDefault(); film.toggle() }
      if (e.key === 'ArrowRight') film.next()
      if (e.key === 'ArrowLeft') film.prev()
      if (e.key === 'r' || e.key === 'R') film.replay()
    }
    if (e.key === 'Escape' && state === 'ASK') sayNo()
    if ((e.key === '-' || e.key === '=') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (e.key === '-') stage.setZoom(Math.min(1.45, stage.getZoom() + 0.22)); else stage.setZoom(Math.max(1, stage.getZoom() - 0.22)) }
    if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey) { const on = !stage.isCinematic(); stage.setCinematic(on); toast(on ? 'Cinematic glow on' : 'Cinematic glow off') }
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) $('c-cc').click()
    if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) $('c-snd').click()
    if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !($('c-mic') as HTMLButtonElement).disabled) $('c-mic').click()
  })
  // chips: one per scene, locked until the film exists
  const chips = $('chips')
  for (const y of ['2015', '2023', '2024', '2026', '2030']) { const c = document.createElement('button'); c.className = 'chip'; c.textContent = y; c.disabled = true; c.title = 'The film arrives in the next phase'; chips.appendChild(c) }
  // pointer depth + click the avatar or the arm and they react
  addEventListener('pointermove', (e) => { const r = document.documentElement.style; r.setProperty('--px', String((e.clientX / innerWidth) * 2 - 1)); r.setProperty('--py', String((e.clientY / innerHeight) * 2 - 1)) })
  let lastPoke = 0
  $('stage').addEventListener('click', (e) => {
    const now = performance.now(); if (now - lastPoke < 2500 || narrator.playing) return
    const nx = (e.clientX / innerWidth) * 2 - 1, ny = (e.clientY / innerHeight) * 2 - 1
    if (Math.abs(nx) < 0.22 && ny > -0.6 && ny < 0.75) {
      lastPoke = now; sfx.chime(); avatar.setExpression('happy'); avatar.play((['wave', 'thumbs_up', 'present'] as const)[Math.floor(Math.random() * 3)])
      toast(['Hey! 👋', 'You found me.', 'Careful, I tickle.'][Math.floor(Math.random() * 3)]); setTimeout(() => avatar.setExpression('neutral'), 2400)
    } else if (nx > 0.45 && ny > 0) {
      lastPoke = now; stage.robot.reach(new THREE.Vector3(0.45, 1.0, 0.25), 1.4); sfx.beep(); toast('ARM-01: beep.')
    }
  })
  // easter egg
  $('nopress').addEventListener('click', () => {
    document.body.classList.add('glitch'); sfx.beep(); setTimeout(() => document.body.classList.remove('glitch'), 520)
    stage.robot.press(new THREE.Vector3(0.7, 0.5, 0.9)); caption('I said do not press.', 'ARM-01'); setTimeout(() => caption(null), 2600)
  })
  void captionsOn
}

export async function startApp() {
  mountStickers(); wireControls()
  askApi = initAsk({ getState, caption, startListening })
  const hash = location.hash.replace('#', '')
  skipEnter = /^(lobby|ask|transition|film-scene\d)$/.test(hash)
  if (skipEnter) addEventListener('pointerdown', () => { sfx.unlock(); startVoice() }, { once: true })     // shortcut links skip Enter, so the first click (a user gesture) switches the microphone on instead
  if (hash === 'dev') { (await import('../dev')).mountDev() }
  await boot()
  // development jumps: #lobby, #ask, #transition skip the Enter click (sound stays locked until a click)
  if (hash === 'lobby' || hash === 'ask' || hash === 'transition') {
    $('app').classList.remove('hidden')
    if (hash === 'ask') ask()
    if (hash === 'transition') void transition()
    if (hash === 'lobby') setState('LOBBY')
  }
  const m = /^film-scene(\d)$/.exec(hash)
  if (m) {                                         // #film-scene3 plays the film from that scene (sound needs a click first)
    $('app').classList.remove('hidden'); setState('FILM'); film.begin(Number(m[1])); film.onEnd(() => setState('END'))
  }
}
export { toast }
;(window as unknown as Record<string, unknown>).__heard = handleSpeech;(window as unknown as Record<string, unknown>).__heardInterim = handleInterim     // dev hook: pretend the microphone heard this sentence
