import { stage } from '../stage'
import { film } from '../film/film'
import { $, log } from './hud'
import { askBrain, speakBrowser, stopBrowserSpeech, SUGGESTIONS, type Answer } from '../brain/brain'
import type { State } from './app'

/** "Ask Alok": type, tap a suggestion, or dictate a question. The film pauses, the twin listens, thinks, answers out loud and the film resumes. */
interface Deps { getState: () => State; caption: (t: string | null) => void; startListening: (onText: (t: string) => void) => boolean }
const { avatar, narrator } = stage
let working = false

export function initAsk(d: Deps) {
  const box = $('askbox'), input = $('askbox-input') as HTMLInputElement, mic = $('askbox-mic'), form = $('askbox-form')
  const chips = $('askbox-chips')
  for (const s of SUGGESTIONS) { const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = s; c.addEventListener('click', () => void submit(s)); chips.appendChild(c) }
  const open = () => { box.classList.remove('hidden'); box.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => input.focus()) }
  const close = () => { if (box.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); box.classList.add('hidden'); box.setAttribute('aria-hidden', 'true') }
  $('c-ask').addEventListener('click', () => (box.classList.contains('hidden') ? open() : close()))
  $('askbox-close').addEventListener('click', close)
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (q) void submit(q) })
  mic.addEventListener('click', () => {
    mic.classList.add('listening'); input.placeholder = 'Listening…'
    const ok = d.startListening((t) => { mic.classList.remove('listening'); input.placeholder = 'Type your question'; input.value = t; void submit(t) })
    if (!ok) { mic.classList.remove('listening'); input.placeholder = 'Voice is not available here: type instead' }
  })
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.classList.contains('hidden')) close(); if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && document.activeElement !== input && d.getState() !== 'BOOT' && d.getState() !== 'ENTER') { e.preventDefault(); open() } })

  async function submit(q: string) {
    if (working) return
    working = true; input.value = ''; close()
    const wasPlaying = film.running && !film.paused
    if (wasPlaying) film.pause()
    narrator.stop(); stopBrowserSpeech()
    log(`Ask: ${q.slice(0, 60)}`)
    avatar.lookAtVisitor(0, 0.05, 8000); avatar.setExpression('neutral')       // listens: eyes on the visitor
    d.caption(`You: “${q}”`)
    const slow = setTimeout(() => d.caption('Good question, one moment…'), 2500)
    let a: Answer
    try { a = await askBrain(q) } finally { clearTimeout(slow) }
    log(`Answer: ${a.source}`)
    await deliver(a)
    d.caption(null); avatar.setExpression('neutral')
    working = false
    if (a.jumpTo && (d.getState() === 'FILM' || d.getState() === 'END')) { film.jump(Number(a.jumpTo.replace('scene', ''))); return }
    if (wasPlaying) film.resume()
  }

  async function deliver(a: Answer) {
    d.caption(a.say); avatar.setExpression(a.mood); avatar.play(a.gesture)
    if (a.audio) await avatar.speakAudio(a.audio)
    else { avatar.flapping = true; await speakBrowser(a.say); avatar.flapping = false }
    if (a.audio?.startsWith('blob:')) URL.revokeObjectURL(a.audio)
  }
}
