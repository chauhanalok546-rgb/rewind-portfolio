import { SYSTEM_PROMPT } from './_prompt.js'

/** POST /api/ask  { q: string, history?: [{ q, a }] }  ->  { say, gesture, mood, jumpTo }
 *  The brain: Claude (ANTHROPIC_API_KEY) or Gemini (GEMINI_API_KEY) with the server-side system prompt. The recent turns of the chat are sent along so
 *  follow-ups ("why?", "give an example") make sense. Keys live only in environment variables. Any failure is a non-200 and the browser falls back to canned answers. */
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'
const LIMIT = 40, WINDOW = 3600_000
const hits = new Map<string, number[]>()           // best-effort per-visitor limiter (per warm instance)
const GESTURES = ['talk', 'point_left', 'point_right', 'nod', 'shrug', 'thumbs_up']
const MOODS = ['neutral', 'happy', 'serious']
export const config = { maxDuration: 30 }

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown; socket?: { remoteAddress?: string } }
interface Res { status(n: number): Res; json(v: unknown): void; setHeader(k: string, v: string): void }
interface Turn { q: string; a: string }

function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW)
  if (list.length >= LIMIT) { hits.set(ip, list); return true }
  list.push(now); hits.set(ip, list)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW)) hits.delete(k)
  return false
}
const safeJson = (s: string): Record<string, unknown> | null => { try { return JSON.parse(s) } catch { return null } }
const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

async function askClaude(key: string, q: string, hist: Turn[]): Promise<string> {
  const messages = hist.flatMap((t) => [{ role: 'user', content: t.q }, { role: 'assistant', content: t.a }]).concat([{ role: 'user', content: q } as never])
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, temperature: 0.7, system: SYSTEM_PROMPT, messages }), signal: AbortSignal.timeout(20000),
  })
  if (!r.ok) throw new Error('claude ' + r.status)
  const data = (await r.json()) as { content?: { type: string; text?: string }[] }
  return data.content?.find((c) => c.type === 'text')?.text ?? ''
}

async function askGemini(key: string, q: string, hist: Turn[]): Promise<string> {
  const models = [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean) as string[]
  const contents = hist.flatMap((t) => [{ role: 'user', parts: [{ text: t.q }] }, { role: 'model', parts: [{ text: JSON.stringify({ say: t.a, gesture: 'talk', mood: 'neutral', jumpTo: null }) }] }]).concat([{ role: 'user', parts: [{ text: q }] }])
  const started = Date.now(); let last = ''
  for (const model of models) {                                      // a busy (503), out-of-quota (429), slow or retired model hands over to the next one
    for (const thinkOff of [true, false]) {                           // first without "thinking" (much faster), then plain if the model refuses that setting
      if (Date.now() - started > 24000) throw new Error('out of time: ' + last)
      try {
        const gen: Record<string, unknown> = { maxOutputTokens: 800, temperature: 0.8, responseMimeType: 'application/json' }
        if (thinkOff) gen.thinkingConfig = { thinkingBudget: 0 }
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, generationConfig: gen }), signal: AbortSignal.timeout(11000),
        })
        if (r.ok) {
          const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
          const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
          if (text.trim()) return text
          last = `${model} empty`; continue
        }
        last = `${model} ${r.status} ${(await r.text()).slice(0, 120)}`
        if (r.status === 400 && thinkOff) continue                    // this model does not take the thinking setting: retry it plain
        if (![400, 404, 429, 500, 503].includes(r.status)) throw new Error(last)
        break                                                         // next model
      } catch (e) { last = `${model} ${(e as Error).message}`; break }   // timeout or network: next model
    }
  }
  throw new Error(last || 'no answer')
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const key = process.env.ANTHROPIC_API_KEY, gem = process.env.GEMINI_API_KEY
  if (!key && !gem) return res.status(503).json({ error: 'brain offline' })
  const fwd = req.headers['x-forwarded-for']
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'
  if (limited(ip)) return res.status(429).json({ error: 'too many questions, try again later' })
  const body = (typeof req.body === 'string' ? safeJson(req.body) : (req.body as Record<string, unknown> | undefined)) ?? {}
  const q = clean(body.q, 400)
  if (q.length < 2) return res.status(400).json({ error: 'empty question' })
  const hist: Turn[] = Array.isArray(body.history) ? (body.history as unknown[]).slice(-4).map((t) => ({ q: clean((t as Turn)?.q, 300), a: clean((t as Turn)?.a, 700) })).filter((t) => t.q && t.a) : []
  try {
    const text = key ? await askClaude(key, q, hist) : await askGemini(gem as string, q, hist)
    const out = safeJson(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const say = out && typeof out.say === 'string' ? out.say.trim() : ''
    if (!say) return res.status(502).json({ error: 'bad answer', detail: text.slice(0, 160) })
    res.status(200).json({
      say: say.slice(0, 1100),
      gesture: GESTURES.includes(out?.gesture as string) ? out?.gesture : 'talk',
      mood: MOODS.includes(out?.mood as string) ? out?.mood : 'neutral',
      jumpTo: typeof out?.jumpTo === 'string' && /^scene[0-6]$/.test(out.jumpTo) ? out.jumpTo : null,
    })
  } catch (e) {
    res.status(502).json({ error: 'upstream', detail: (e as Error).message.slice(0, 220) })
  }
}
