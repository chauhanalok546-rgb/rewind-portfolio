import { SYSTEM_PROMPT } from './_prompt.js'

/** POST /api/ask  { q: string }  ->  { say, gesture, mood, jumpTo }
 *  Calls the Claude API with the server-side system prompt. The key lives only in the ANTHROPIC_API_KEY environment variable.
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
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return res.status(503).json({ error: 'brain offline' })
  const fwd = req.headers['x-forwarded-for']
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'
  if (limited(ip)) return res.status(429).json({ error: 'too many questions, try again later' })
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body as { q?: unknown } | undefined)
  const q = typeof body?.q === 'string' ? body.q.trim().slice(0, 300) : ''
  if (q.length < 2) return res.status(400).json({ error: 'empty question' })
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: q }] }),
      signal: AbortSignal.timeout(7500),
    })
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status })
    const data = (await r.json()) as { content?: { type: string; text?: string }[] }
    const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
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
