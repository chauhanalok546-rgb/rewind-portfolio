import { SYSTEM_PROMPT } from './_prompt.js'

/** POST /api/ask  { q: string }  ->  { say, gesture, mood, jumpTo }
 *  Calls Claude (ANTHROPIC_API_KEY) or, if only that is set, Gemini (GEMINI_API_KEY) with the server-side system prompt. Keys live only in environment variables.
 *  With no key, an error, or a slow answer the response is a non-200 and the browser falls back to canned answers. */
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'
const LIMIT = 20, WINDOW = 3600_000
const hits = new Map<string, number[]>()           // best-effort per-visitor limiter (per warm instance)
const GESTURES = ['talk', 'point_left', 'point_right', 'nod', 'shrug', 'thumbs_up']
const MOODS = ['neutral', 'happy', 'serious']

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown; socket?: { remoteAddress?: string } }
interface Res { status(n: number): Res; json(v: unknown): void; setHeader(k: string, v: string): void }

function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW)
  if (list.length >= LIMIT) { hits.set(ip, list); return true }
  list.push(now); hits.set(ip, list)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW)) hits.delete(k)
  return false
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const key = process.env.ANTHROPIC_API_KEY, gem = process.env.GEMINI_API_KEY
  if (!key && !gem) return res.status(503).json({ error: 'brain offline' })
  const fwd = req.headers['x-forwarded-for']
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'
  if (limited(ip)) return res.status(429).json({ error: 'too many questions, try again later' })
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body as { q?: unknown } | undefined)
  const q = typeof body?.q === 'string' ? body.q.trim().slice(0, 300) : ''
  if (q.length < 2) return res.status(400).json({ error: 'empty question' })
  try {
    let text = ''
    if (key) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 300, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: q }] }),
        signal: AbortSignal.timeout(7500),
      })
      if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status })
      const data = (await r.json()) as { content?: { type: string; text?: string }[] }
      text = data.content?.find((c) => c.type === 'text')?.text ?? ''
    } else {
      const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': gem as string },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: q }] }], generationConfig: { maxOutputTokens: 300, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } }),
        signal: AbortSignal.timeout(7500),
      })
      if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status, detail: (await r.text()).slice(0, 240) })
      const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    }
    const out = safeJson(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown> | null
    if (!out || typeof out.say !== 'string' || !out.say.trim()) return res.status(502).json({ error: 'bad answer' })
    res.status(200).json({
      say: out.say.trim().slice(0, 500),
      gesture: GESTURES.includes(out.gesture as string) ? out.gesture : 'talk',
      mood: MOODS.includes(out.mood as string) ? out.mood : 'neutral',
      jumpTo: typeof out.jumpTo === 'string' && /^scene[0-6]$/.test(out.jumpTo) ? out.jumpTo : null,
    })
  } catch {
    res.status(504).json({ error: 'timeout' })
  }
}

function safeJson(s: string): { q?: unknown } | null { try { return JSON.parse(s) } catch { return null } }
