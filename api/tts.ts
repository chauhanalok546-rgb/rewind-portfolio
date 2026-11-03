/** POST /api/tts  { text }  ->  audio/mpeg   (ElevenLabs; needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID).
 *  Without them the response is 503 and the browser uses its own speech voice. The avatar lip-syncs from the audio itself, so no timestamps are needed. */
interface Req { method?: string; body?: unknown }
interface Res { status(n: number): Res; json(v: unknown): void; send(b: Buffer): void; setHeader(k: string, v: string): void }

export default async function handler(req: Req, res: Res) {
  const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE_ID
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!key || !voice) return res.status(503).json({ error: 'voice offline' })
  let b: { text?: unknown } = {}
  try { b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as { text?: unknown }) ?? {} } catch { /* empty */ }
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 500) : ''
  if (!text) return res.status(400).json({ error: 'no text' })
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' }), signal: AbortSignal.timeout(7500),
    })
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status })
    res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(Buffer.from(await r.arrayBuffer()))
  } catch { res.status(504).json({ error: 'timeout' }) }
}
