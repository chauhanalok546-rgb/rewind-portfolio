import { stage } from '../stage'
import { film } from '../film/film'
import { $, log } from './hud'
import { askBrain, speakBrowser, stopBrowserSpeech, SUGGESTIONS, type Answer } from '../brain/brain'
import type { State } from './app'

/** "Ask Alok": the moment it is opened everything stops where it is (the film, the line he is saying, his wandering). He listens, answers the
 *  visitor's question out loud, and then the world picks up exactly where it left off: the same line continues from the same word. */
interface Deps { getState: () => State; caption: (t: string | null) => void; startListening: (onText: (t: string) => void) => boolean }
const { avatar, narrator } = stage
let working = false
let askToken = 0                 // a newer question supersedes an older one that is still thinking or speaking
let held = false, wasPlaying = false, wasAuto = false
let snap: ReturnType<typeof avatar.holdSpeech> = null
let prevCaption = { text: '', on: false }

export function initAsk(d: Deps): { ask: (q: string) => Promise<void> } {
  const box = $('askbox'), input = $('askbox-input') as HTMLInputElement, mic = $('askbox-mic'), form = $('askbox-form')
  const chips = $('askbox-chips')
  for (const s of SUGGESTIONS) { const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = s; c.addEventListener('click', () => void submit(s)); chips.appendChild(c) }
  function holdWorld() {
    if (held) return
    held = true
    const sub = $('sub'); prevCaption = { text: sub.textContent ?? '', on: sub.classList.contains('on') }
    snap = avatar.holdSpeech(); narrator.hold(); stopBrowserSpeech()           // freeze the line he is saying, keep its place, block the next one
    wasPlaying = film.running && !film.paused; if (wasPlaying) film.pause()      // freeze the film
    wasAuto = avatar.isAutonomous; avatar.setAutonomous(false)                   // no wandering while he is listening
    avatar.lookAtVisitor(0, 0.05, 120000)                                        // eyes on the visitor
  }
  function releaseWorld() {
    if (!held) return
    held = false
    avatar.lookAtVisitor(0, 0.03, 1); avatar.setExpression('neutral')
    d.caption(prevCaption.on ? prevCaption.text : null)                           // the caption he was showing comes back
    narrator.release(); avatar.resumeSpeech(snap); snap = null                    // the interrupted line carries on from the same spot
    if (wasAuto) avatar.setAutonomous(true)
    if (wasPlaying) film.resume()
  }
  const open = () => { holdWorld(); box.classList.remove('hidden'); box.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => input.focus()) }
  const close = () => { askToken++; stopAnswer(); working = false; hide(); releaseWorld() }
  const hide = () => { if (box.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); box.classList.add('hidden'); box.setAttribute('aria-hidden', 'true') }
  $('c-ask').addEventListener('click', () => (box.classList.contains('hidden') ? open() : close()))
  $('askbox-close').addEventListener('click', close)
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (q) void submit(q) })
  mic.addEventListener('click', () => {
    mic.classList.add('listening'); input.placeholder = 'Listening…'
    const ok = d.startListening((t) => { mic.classList.remove('listening'); input.placeholder = 'Type your question'; input.value = t; void submit(t) })
    if (!ok) { mic.classList.remove('listening'); input.placeholder = 'Voice is not available here: type instead' }
  })
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.classList.contains('hidden')) close(); if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && document.activeElement !== input && d.getState() !== 'BOOT' && d.getState() !== 'ENTER') { e.preventDefault(); open() } })

  /** cut off whatever answer is being spoken right now (his voice, the browser voice, the jaw flap) */
  function stopAnswer() { avatar.stop(); stopBrowserSpeech(); avatar.flapping = false }

  async function submit(q: string) {
    const my = ++askToken                                                          // a question picked while another is being answered replaces it at once
    if (working) stopAnswer()
    working = true; input.value = ''; holdWorld()                                  // the panel stays open so another question can be picked
    log(`Ask: ${q.slice(0, 60)}`)
    d.caption(`You: “${q}”`); avatar.setExpression('neutral')
    const slow = setTimeout(() => { if (my === askToken) d.caption('Good question, one moment…') }, 2500)
    let a: Answer
    try { a = await askBrain(q) } finally { clearTimeout(slow) }
    if (my !== askToken) return                                                    // superseded while thinking
    log(`Answer: ${a.source}`)
    await deliver(a, my)
    if (my !== askToken) return                                                    // superseded while speaking: the newer question owns the rest
    working = false; hide()
    releaseWorld()                                                                 // back to exactly where we were (the answer never skips ahead in the story)
  }

  async function deliver(a: Answer, my: number) {
    if (my !== askToken) return
    d.caption(a.say); avatar.setExpression(a.mood); avatar.play(a.gesture)
    if (a.audio) await avatar.speakAudio(a.audio)
    else { avatar.flapping = true; await speakBrowser(a.say); if (my === askToken) avatar.flapping = false }
    if (a.audio?.startsWith('blob:')) URL.revokeObjectURL(a.audio)
  }
  return { ask: submit }
}
