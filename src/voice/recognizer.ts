/** Speech recognition (Web Speech API) for short voice commands. English (India), falling back to US English.
 *  Starts only after the Enter click, shows a clear indicator while listening, never stores audio. */
interface SR { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start(track?: MediaStreamTrack): void; stop(): void; abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null }
type SRCtor = new () => SR
const Ctor = (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition

export const voiceSupported = !!Ctor

export class Recognizer {
  private rec?: SR
  private stream: MediaStream | null = null
  /** a microphone track with echo cancellation, noise suppression and gain control switched on: what he says through the speakers is subtracted
   *  from what the recogniser hears, so "Hey Alok" gets through while he is talking (Chrome lets start() take a track; other browsers ignore it) */
  private async track(): Promise<MediaStreamTrack | null> {
    try {
      this.stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      return this.stream.getAudioTracks()[0] ?? null
    } catch { return null }
  }
  private async begin(r: SR) {
    const t = await this.track()
    try { if (t) r.start(t); else r.start() }
    catch { try { r.start() } catch { this.rec = undefined } }
  }
  private wantOn = false
  private lang = 'en-IN'
  private errors = 0
  state: 'off' | 'listening' | 'blocked' | 'unsupported' = voiceSupported ? 'off' : 'unsupported'
  onFinal?: (text: string) => void
  /** words as they are being recognised (before the sentence is finished): lets him react to "Hey Alok" at once, even mid-sentence */
  onInterim?: (text: string) => void
  onState?: (s: Recognizer['state']) => void

  private set(s: Recognizer['state']) { this.state = s; this.onState?.(s) }

  start() {
    if (!Ctor || this.state === 'blocked') return
    this.wantOn = true
    if (this.rec) return
    const r = new Ctor()
    r.lang = this.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1
    r.onstart = () => this.set('listening')
    r.onresult = (e) => { this.errors = 0; for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) this.onFinal?.(res[0].transcript); else this.onInterim?.(res[0].transcript) } }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.wantOn = false; this.set('blocked') }
      else if (e.error === 'language-not-supported' && this.lang !== 'en-US') this.lang = 'en-US'
      else if (e.error !== 'no-speech' && e.error !== 'aborted') this.errors++
    }
    r.onend = () => {                       // the browser stops recognition now and then: restart while wanted
      this.rec = undefined
      if (this.wantOn && this.errors < 6) setTimeout(() => this.start(), 250)
      else if (this.state !== 'blocked') this.set('off')
    }
    this.rec = r
    void this.begin(r)
  }
  stop() { this.wantOn = false; this.rec?.stop(); if (this.state === 'listening') this.set('off') }
  toggle() { if (this.wantOn) this.stop(); else this.start() }
  get listening() { return this.wantOn && this.state === 'listening' }
}
