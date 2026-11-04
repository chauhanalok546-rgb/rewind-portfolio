import type { Avatar, Expression, Gesture } from '../avatar/Avatar'

export interface ScriptLine { id: string; speaker: 'ALOK' | 'ARM-01'; scene: string; gesture: string | null; text: string; duration?: number }

/** Plays the scripted narration lines: audio, captions, mood and gestures. Audio files are static, no API calls. */
export class Narrator {
  lines: ScriptLine[] = []
  private token = 0
  onCaption?: (text: string | null, line?: ScriptLine) => void

  private avatar: Avatar
  private base: string

  constructor(avatar: Avatar, base = '/audio/narration') { this.avatar = avatar; this.base = base }

  async load() {
    const r = await fetch(`${this.base}/script.json`)
    this.lines = (await r.json()).lines
    return this
  }

  get playing() { return this.token > 0 }

  /** while held, no new line starts (a line already playing is paused by the avatar, see Avatar.holdSpeech) */
  private gate: Promise<void> | null = null
  private open?: () => void
  hold() { if (!this.gate) this.gate = new Promise<void>((r) => { this.open = r }) }
  release() { this.open?.(); this.gate = null; this.open = undefined }

  stop() {
    this.token++ ; this.avatar.stop(); this.onCaption?.(null); this.avatar.setExpression('neutral')
  }

  /** Plays one line; resolves when it ends (or is interrupted). ARM-01 lines show a different caption tag. */
  async playLine(id: string): Promise<void> {
    const line = this.lines.find((l) => l.id === id)
    if (!line) return
    await this.gate
    const my = ++this.token
    this.onCaption?.(line.text, line)
    this.mood(line)
    await this.avatar.speakAudio(`${this.base}/${line.id}.mp3`)
    if (my !== this.token) return
    this.onCaption?.(null)
    this.avatar.setExpression('neutral')
  }

  async playSequence(ids: string[], gapMs = 350) {
    const my = ++this.token
    for (const id of ids) {
      await this.gate
      if (my !== this.token) return
      const line = this.lines.find((l) => l.id === id)
      if (!line) continue
      this.onCaption?.(line.text, line)
      this.mood(line)
      await this.avatar.speakAudio(`${this.base}/${line.id}.mp3`)
      if (my !== this.token) return
      this.onCaption?.(null)
      await new Promise((r) => setTimeout(r, gapMs))
    }
    if (my === this.token) { this.avatar.setExpression('neutral'); this.token = 0 }
  }

  private mood(line: ScriptLine) {
    const a = this.avatar
    if (line.speaker === 'ARM-01') { a.setExpression('neutral'); return }
    const g = line.gesture
    const exp: Expression = g === 'greet' ? 'happy' : g === 'serious' ? 'serious' : g === 'proud' ? 'proud' : 'neutral'
    a.setExpression(exp)
    if (g === 'greet') a.play('namaste' as Gesture)
    else if (g === 'present' || g === 'proud') a.play('present' as Gesture)
    else if (g === 'point') a.play('point' as Gesture)
  }
}
