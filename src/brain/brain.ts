import type { Gesture } from '../avatar/Avatar'

export interface Answer { say: string; gesture: Gesture; mood: 'neutral' | 'happy' | 'serious' | 'proud'; jumpTo: string | null; audio?: string; source: 'live' | 'canned' | 'unknown' }
interface Canned { id: string; duration?: number; q: string; keys: string[]; say: string; gesture: Gesture; mood: Answer['mood']; jumpTo: string | null }

const TIMEOUT = 26000                 // a real answer is worth waiting for (the caption says "one moment" after 2.5 s); the server gives up on its own at ~24 s
const history: { q: string; a: string }[] = []        // the last few turns, sent along so follow-ups ("why?", "give an example") make sense
const GESTURE: Record<string, Gesture> = { talk: 'talk1', point_left: 'point', point_right: 'point', nod: 'talk2', shrug: 'present', thumbs_up: 'thumbs_up' }
let canned: Promise<Canned[]> | null = null
const loadCanned = () => (canned ??= fetch('/audio/answers/answers.json').then((r) => r.json()).then((j) => j.answers as Canned[]).catch(() => []))

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** the closest canned answer: any key phrase contained in the question wins (longest first); nothing close returns null */
export async function closestCanned(q: string): Promise<Canned | null> {
  const t = norm(q); let best: Canned | null = null, score = 0
  for (const a of await loadCanned()) for (const k of a.keys) if (t.includes(norm(k)) && k.length > score) { best = a; score = k.length }
  return best
}

const timed = (ms: number) => AbortSignal.timeout(ms)

/** live brain first (Claude via /api/ask, voice via /api/tts), then recorded canned answers, then an honest "I don't know". */
export async function askBrain(q: string): Promise<Answer> {
  try {
    const t0 = performance.now()
    const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, history: history.slice(-4) }), signal: timed(TIMEOUT) })
    if (r.ok) {
      const j = await r.json()
      history.push({ q, a: j.say }); if (history.length > 6) history.shift()
      const ans: Answer = { say: j.say, gesture: GESTURE[j.gesture] ?? 'talk1', mood: j.mood ?? 'neutral', jumpTo: j.jumpTo ?? null, source: 'live' }
      try {
        const left = Math.max(3000, Math.min(9000, TIMEOUT - (performance.now() - t0)))
        const v = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: j.say }), signal: timed(left) })
        if (v.ok) ans.audio = URL.createObjectURL(await v.blob())
      } catch { /* browser voice will speak it */ }
      return ans
    }
  } catch { /* offline, no key, rate-limited or slow: fall through */ }
  const c = await closestCanned(q)
  if (c) return { say: c.say, gesture: c.gesture, mood: c.mood, jumpTo: c.jumpTo, audio: c.duration ? `/audio/answers/${c.id}.mp3` : undefined, source: 'canned' }
  return { say: "Hmm, my thinking cap isn't working properly right now, so I can't answer that one well. Ask me again in a moment, or find the real Alok on LinkedIn as alok-chauhan-72a9603a1.", gesture: 'present', mood: 'neutral', jumpTo: null, source: 'unknown' }
}

/** speaks with the browser's own voice (no audio file to analyse); resolves at the end */
export function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { setTimeout(resolve, Math.min(9000, text.length * 55)); return }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-IN'; u.rate = 1.05
    u.onend = () => resolve(); u.onerror = () => resolve()
    speechSynthesis.cancel(); speechSynthesis.speak(u)
  })
}
export const stopBrowserSpeech = () => { try { speechSynthesis.cancel() } catch { /* none */ } }

export const SUGGESTIONS = ['Tell me about yourself', 'Why Wispr Flow?', 'Which project are you proudest of?', 'What is your biggest setback?', 'Are you real?', 'How can I contact you?']
