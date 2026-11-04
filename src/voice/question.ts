/** Is this spoken sentence a question for Alok? (pure functions, no browser APIs, so they can be tested)
 *  Strict on purpose: it must be shaped like a question and long enough, and it must not be an echo of what the speakers just said. */
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
const STARTERS = ['what', "what's", 'whats', 'who', "who's", 'why', 'how', 'when', 'where', 'which', 'can', 'could', 'do', 'does', 'did', 'are', 'is', 'will', 'would', 'have', 'has', 'tell', 'explain', 'describe', 'walk', 'show', 'give', 'talk', 'say', 'hey', 'hi', 'hello', 'alok', 'ringo', 'so', 'and', 'but', 'also']
const ASKING = ['tell me', 'can you', 'could you', 'do you', 'did you', 'are you', 'have you', 'will you', 'would you', 'what is', "what's", 'what are', 'what do', 'what did', 'how did', 'how do', 'how can', 'how would', 'why did', 'why do', 'why are', 'why should', 'who are', 'who is', 'where do', 'where did', 'where are', 'when did', 'walk me', 'explain', 'describe', 'your ', 'yourself', 'about you']
const BAD = new Set(['okay', 'ok', 'yes', 'no', 'yeah', 'next', 'back', 'pause', 'play', 'stop', 'skip', 'replay'])

export function looksLikeQuestion(text: string): boolean {
  const t = norm(text), w = t.split(' ').filter(Boolean)
  if (w.length < 3 || w.length > 40) return false
  if (w.every((x) => BAD.has(x))) return false
  const first = w[0]
  const shaped = STARTERS.includes(first) || ASKING.some((p) => t.includes(p))
  const aboutHim = /\b(you|your|yours|yourself|alok|ringo)\b/.test(t)
  return shaped && (aboutHim || ['what', "what's", 'whats', 'why', 'how', 'who', 'where', 'when', 'which', 'tell', 'explain', 'describe'].includes(first))
}

/** True when what the microphone heard is mostly words the speakers just said (his own narration or answer coming back in). */
export function isEcho(text: string, recent: string[]): boolean {
  const heard = norm(text).split(' ').filter((x) => x.length > 2)
  if (heard.length < 3) return false
  const pool = new Set(recent.flatMap((r) => norm(r).split(' ')))
  const hit = heard.filter((x) => pool.has(x)).length
  return hit / heard.length >= 0.6
}

/** "Hey Alok, listen": the wake phrase. Tolerant of how speech recognition hears the name ("a lock", "aloke", "alock"...).
 *  Returns null when there is no wake phrase, otherwise whatever was said after it (possibly the question itself). */
const NAME = '(?:alok|aloke|alock|a lock|aluk|alokh|aloc|alex)'
const WAKE_A = new RegExp(`\\b(?:hey|hi|hello|okay|ok|yo|hay|he)\\s+${NAME}\\b(.*)$`)
const WAKE_B = new RegExp(`\\b${NAME}\\s+(?:listen|are you there|can you hear me|wake up|hear me)\\b(.*)$`)
const WAKE_C = new RegExp(`\\blisten\\s+${NAME}\\b(.*)$`)
export function wakePhrase(text: string): string | null {
  const t = norm(text)
  for (const re of [WAKE_A, WAKE_B, WAKE_C]) { const m = re.exec(t); if (m) return m[1].replace(/^\s*(listen|please|can you hear me|are you there)\b/, '').trim() }
  return null
}
