import * as THREE from 'three'
import { fx, loadStage, stage, type Theme } from '../stage'
import { film } from '../film/film'
import { $, decay, hide, log, reduced, setStatus, shockwave, show, wait, whiteFlash } from './hud'
import { tunnel } from '../film/tunnel'
import gsap from 'gsap'
import { sfx } from '../audio/sfx'
import { mountStickers, toast } from '../ui/stickers'
import { startPresence, type Presence } from '../sense/presence'
import { Recognizer, voiceSupported } from '../voice/recognizer'
import { parseCommand } from '../voice/parse'
import { initAsk } from './ask'

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
function caption(text: string | null, speaker?: string) {
  const el = $('sub')
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
  await narrator.playSequence(['greet_1', 'greet_2'])   // namaste + two greeting lines
  avatar.setExpression('neutral')
  ask()
}

/* ---------- voice commands ---------- */
const recognizer = new Recognizer()
function heard(text: string) {
  const el = document.createElement('div'); el.className = 'heard'; el.textContent = `“${text.trim()}”`
  document.getElementById('app')!.appendChild(el); setTimeout(() => el.remove(), 2500)
}
let askCapture: ((t: string) => void) | null = null   // set while the Ask Alok panel waits for a dictated question
function handleSpeech(text: string) {
  if (askCapture) { const f = askCapture; askCapture = null; f(text); return }
  const cmd = parseCommand(text, { asking: state === 'ASK', inFilm: state === 'FILM' || state === 'END' })
  if (!cmd) return
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
function startVoice() {
  if (!voiceSupported) return
  const mic = $('c-mic') as HTMLButtonElement
  mic.disabled = false; mic.title = 'Voice commands: say pause, skip, back, replay, contact or a year (M)'
  recognizer.onFinal = handleSpeech
  recognizer.onState = (st) => {
    const on = st === 'listening'
    mic.classList.toggle('listening', on); mic.setAttribute('aria-pressed', String(on))
    document.documentElement.dataset.voice = on ? 'on' : 'off'
    if (on && !mic.dataset.logged) { mic.dataset.logged = '1'; log('Microphone listening ✓') }
    if (st === 'blocked') { mic.disabled = true; mic.title = 'Microphone blocked: buttons do everything'; log('Microphone declined') }
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
  sfx.snap(); avatar.blinkNow(0.5); shockwave()      // the snap: a crisp click and rings of light from him
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
  $('c-theme').addEventListener('click', () => stage.setTheme((stage.getTheme() === 'cinematic' ? 'lab' : 'cinematic') as Theme))
  $('c-play').addEventListener('click', () => film.toggle())
  $('c-prev').addEventListener('click', () => film.prev())
  $('c-next').addEventListener('click', () => film.next())
  addEventListener('keydown', (e) => {
    if (state === 'FILM' || state === 'END') {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('button,a')) { e.preventDefault(); film.toggle() }
      if (e.key === 'ArrowRight') film.next()
      if (e.key === 'ArrowLeft') film.prev()
      if (e.key === 'r' || e.key === 'R') film.replay()
    }
    if (e.key === 'Escape' && state === 'ASK') sayNo()
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
  initAsk({ getState, caption, startListening })
  const hash = location.hash.replace('#', '')
  skipEnter = /^(lobby|ask|transition|film-scene\d)$/.test(hash)
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
