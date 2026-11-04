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

export function initAsk(d: Deps): { ask: (q: string) => Promise<void>; listen: () => void; isListening: () => boolean; ready: () => boolean } {
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
    if (!held) { narrator.release(); return }
    held = false
    avatar.lookAtVisitor(0, 0.03, 1); avatar.setExpression('neutral')
    d.caption(prevCaption.on ? prevCaption.text : null)                           // the caption he was showing comes back
    narrator.release(); avatar.resumeSpeech(snap, 420); snap = null                    // the interrupted line carries on from the same spot
    if (wasAuto) avatar.setAutonomous(true)
    if (wasPlaying) film.resume()
  }
  const open = () => { holdWorld(); box.classList.remove('hidden'); box.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => input.focus()) }
  const close = () => { askToken++; stopAnswer(); working = false; listening = false; clearTimeout(listenTimer); hide(); releaseWorld() }
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

  /** the friendly lines he says when woken ("Yes, I'm listening.") and when nothing follows ("No worries, let me carry on."), recorded in his voice */
  let phrases: { id: string; text: string; duration?: number }[] = []
  void fetch('/audio/listen/phrases.json').then((r) => r.json()).then((j) => { phrases = j.lines ?? [] }).catch(() => undefined)
  const FALLBACK = { ack: "Yes, I'm listening.", skip: "No worries, let me carry on." }
  async function say(kind: 'ack' | 'skip') {
    const pool = phrases.filter((p) => p.id.startsWith(kind + '_') && p.duration)
    const p = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
    const text = p?.text ?? FALLBACK[kind]
    d.caption(text); avatar.setExpression('happy')
    if (p) await avatar.speakAudio(`/audio/listen/${p.id}.mp3`)
    else { avatar.flapping = true; await speakBrowser(text); avatar.flapping = false }
  }

  /** "Hey Alok, listen": his voice fades out and the story holds where it is; he answers kindly ("Yes, I'm listening."), then waits (10 s) for the visitor's
   *  question, which the app passes to submit. No question: "No worries, let me carry on." and the story picks up where it stopped, his voice fading back in. */
  let listening = false, ready = false, listenTimer: ReturnType<typeof setTimeout> | undefined, listenSeq = 0
  async function listen() {
    if (listening) return
    const mine = ++listenSeq
    askToken++; if (working) { stopAnswer(); working = false }                      // if he was answering, that stops too
    listening = true; ready = false
    narrator.hold()                                                                  // no new line starts from here on
    await avatar.fadeOut(280)                                                        // the voice fades out ...
    if (mine !== listenSeq || !listening) return
    holdWorld(); hide()                                                              // ... and everything holds exactly there
    avatar.lookAtVisitor(0, 0.05, 40000); log('Listening for a question')
    await say('ack')                                                                 // "Yes, I'm listening."
    if (mine !== listenSeq || !listening) return
    ready = true; d.caption('Listening… go ahead and ask me anything.')
    listenTimer = setTimeout(async () => {
      if (mine !== listenSeq || !listening) return
      listening = false; ready = false                                               // nobody asked anything
      await say('skip')                                                              // "No worries, let me carry on."
      if (mine !== listenSeq) return
      releaseWorld()                                                                 // back to the story, voice fading in
    }, 10000)
  }

  async function submit(q: string) {
    listening = false; ready = false; clearTimeout(listenTimer); listenSeq++
    const my = ++askToken
    stopAnswer()                                                                     // an acknowledgement or older answer still talking stops now
    if (!held) { narrator.hold(); await avatar.fadeOut(220); if (my !== askToken) return }   // a question asked in one breath: his voice fades out first                                                          // a question picked while another is being answered replaces it at once
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
  return { ask: submit, listen, isListening: () => listening, ready: () => listening && ready }
}
