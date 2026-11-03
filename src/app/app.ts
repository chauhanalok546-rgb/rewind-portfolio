import { fx, loadStage, stage, type Theme } from '../stage'
import { sfx } from '../audio/sfx'
import { mountStickers, toast } from '../ui/stickers'

/** The experience as an explicit state machine:  BOOT → ENTER → LOBBY → PRESENCE → GREETING → ASK → TRANSITION → ARRIVED
 *  (the film itself arrives in the next phase).  Any state can be jumped to with a URL hash, e.g. #ask or #lobby. */
export type State = 'BOOT' | 'ENTER' | 'LOBBY' | 'PRESENCE' | 'GREETING' | 'ASK' | 'TRANSITION' | 'ARRIVED'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
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
    const step = () => { el.textContent += text[i++] ?? ''; if (i < text.length) setTimeout(step, reduced ? 0 : speed); else resolve() }
    step()
  })
}
function log(line: string) {
  const ul = $('logs'); const li = document.createElement('li'); li.textContent = line; ul.appendChild(li)
  while (ul.children.length > 4) ul.firstElementChild!.remove()
}
function setStatus(text: string, travelling = false) { const s = $('status'); s.textContent = text; s.classList.toggle('travelling', travelling) }
function caption(text: string | null, speaker?: string) {
  const el = $('sub')
  if (!text) { el.classList.remove('on'); return }
  el.textContent = speaker === 'ARM-01' ? `ARM-01: ${text}` : text
  el.classList.add('on')
}
narrator.onCaption = (t, l) => caption(t, l?.speaker)

let yearNow = 2026
function animateYear(to: number, ms: number): Promise<void> {
  const from = yearNow
  if (reduced || ms <= 0) { yearNow = to; $('year').textContent = String(to); return Promise.resolve() }
  return new Promise((resolve) => {
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3)
      yearNow = Math.round(from + (to - from) * e); $('year').textContent = String(yearNow)
      if (k < 1) requestAnimationFrame(step); else resolve()
    }
    requestAnimationFrame(step)
  })
}
/** decay a 0..1 effect value back to 0 */
function decay(key: 'flare' | 'chrono', ms: number) {
  const t0 = performance.now(), v0 = fx[key]
  const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); fx[key] = v0 * (1 - k); if (k < 1) requestAnimationFrame(step) }
  requestAnimationFrame(step)
}

/* ---------- screens ---------- */
function show(id: string) { const el = $(id); el.classList.remove('hidden'); el.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => el.classList.remove('fade-out')) }
function hide(id: string, ms = 450) {
  const el = $(id); el.classList.add('fade-out'); el.setAttribute('aria-hidden', 'true')
  setTimeout(() => { if (el.classList.contains('fade-out')) el.classList.add('hidden') }, ms)
}

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

function enter() {
  setState('ENTER')
  show('enter')
  const btn = $('enter-btn'); btn.focus()
  btn.addEventListener('click', () => {
    sfx.unlock()                                   // the click unlocks sound
    hide('enter'); lobby()
  }, { once: true })
}

async function lobby() {
  setState('LOBBY')
  $('app').classList.remove('hidden')
  setStatus('Standby')
  log('Audio channel open ✓')
  await wait(2400)                                 // the avatar idles and glances around first
  presence()
}

async function presence() {
  setState('PRESENCE')
  log('Visitor connected ✓')
  avatar.setExpression('happy')
  await wait(900)
  greeting()
}

async function greeting() {
  setState('GREETING')
  await narrator.playSequence(['greet_1', 'greet_2'])   // namaste + two greeting lines
  avatar.setExpression('neutral')
  ask()
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
  log('Destination locked: 2015')
  setStatus('Travelling', true)
  await narrator.playLine('yes_1')                 // "Great. Stay close to the platform."
  await wait(250)

  const snapped = new Promise<void>((resolve) => {
    avatar.onEvent = (name) => { if (name === 'snap') { avatar.onEvent = undefined; resolve() } }
    avatar.play('snap')
  })
  await snapped                                    // fingers slip: crisp snap
  sfx.snap(); avatar.blinkNow(0.5)                 // slow blink
  fx.flare = 1; fx.chrono = 1; decay('chrono', 2600)  // chronometer flares, rings flare
  fx.ringSpeed = 5; fx.motes = 4
  await wait(reduced ? 80 : 260)
  void animateYear(2015, reduced ? 0 : 1500)

  sfx.whoosh(1.4)
  await whiteFlash(async () => {                    // at the flash peak the scene swaps behind the light
    sfx.stopHum(); show('arrived'); hide('app', 10)
  })
  sfx.chime(); decay('flare', 1600)
  fx.ringSpeed = 1; fx.motes = 1
  setStatus('Arrived'); setState('ARRIVED'); busy = false
  $('arrived-back').focus()
}

/** One flash: fade in 200 ms, hold 150 ms, fade out 700 ms (reduced motion: soft 600 ms fade at 85%). */
async function whiteFlash(atPeak: () => void | Promise<void>) {
  const el = $('flash')
  if (reduced) {
    el.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.4 }, { opacity: 0 }], { duration: 600, easing: 'ease-in-out' })
    await wait(240); await atPeak(); await wait(360); return
  }
  const total = 1050
  const a = el.animate([{ opacity: 0 }, { opacity: 1, offset: 200 / total }, { opacity: 1, offset: 350 / total }, { opacity: 0 }], { duration: total, easing: 'linear' })
  await wait(300); await atPeak()
  await a.finished.catch(() => undefined)
}

function backToLab() {
  hide('arrived'); $('app').classList.remove('hidden')
  yearNow = 2015; void animateYear(2026, reduced ? 0 : 1200)
  setStatus('Standby'); setState('LOBBY'); log('Returned to the lab'); sfx.startHum()
  avatar.setExpression('neutral'); $('c-time').classList.add('pulse')
}

/* ---------- controls ---------- */
function wireControls() {
  $('ask-yes').addEventListener('click', () => void sayYes())
  $('ask-no').addEventListener('click', sayNo)
  $('arrived-back').addEventListener('click', backToLab)
  $('c-time').addEventListener('click', () => { if (state === 'LOBBY') ask() })
  const toggle = (id: string, on: (v: boolean) => void) => { const b = $(id); b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); b.classList.toggle('on', v); on(v) }) }
  toggle('c-cc', (v) => { captionsOn = v; $('sub').classList.toggle('off', !v) })
  toggle('c-snd', (v) => { sfx.setMuted(!v); avatar.setMuted(!v); $('c-snd').textContent = v ? '🔊' : '🔇' })
  $('c-theme').addEventListener('click', () => stage.setTheme((stage.getTheme() === 'cinematic' ? 'lab' : 'cinematic') as Theme))
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state === 'ASK') sayNo()
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) $('c-cc').click()
    if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) $('c-snd').click()
  })
  // chips: one per scene, locked until the film exists
  const chips = $('chips')
  for (const y of ['2015', '2023', '2024', '2026', '2030']) { const c = document.createElement('button'); c.className = 'chip'; c.textContent = y; c.disabled = true; c.title = 'The film arrives in the next phase'; chips.appendChild(c) }
  // easter egg
  $('nopress').addEventListener('click', () => {
    document.body.classList.add('glitch'); sfx.beep(); setTimeout(() => document.body.classList.remove('glitch'), 520)
    caption('I said do not press.', 'ARM-01'); setTimeout(() => caption(null), 2600)
  })
  void captionsOn
}

export async function startApp() {
  mountStickers(); wireControls()
  const hash = location.hash.replace('#', '')
  if (hash === 'dev') { (await import('../dev')).mountDev() }
  await boot()
  // development jumps: #lobby, #ask, #transition skip the Enter click (sound stays locked until a click)
  if (hash === 'lobby' || hash === 'ask' || hash === 'transition') {
    hide('enter', 10); $('app').classList.remove('hidden')
    if (hash === 'ask') ask()
    if (hash === 'transition') void transition()
    if (hash === 'lobby') setState('LOBBY')
  }
}
export { toast }
