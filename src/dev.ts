import type { Expression, Gesture } from './avatar/Avatar'
import { stage } from './stage'

/** Developer panel, only when the URL has #dev: try expressions, gestures, camera, narration lines. */
export function mountDev() {
  const { avatar, narrator } = stage
  const p = document.createElement('div'); p.className = 'glass dev'
  const row = (items: Array<[string, () => void]>) => {
    const r = document.createElement('div'); r.className = 'row'
    for (const [label, fn] of items) { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; r.appendChild(b) }
    p.appendChild(r)
  }
  p.insertAdjacentHTML('afterbegin', '<b class="mono">dev</b>')
  row((['neutral', 'happy', 'serious', 'proud'] as Expression[]).map((e) => [e, () => avatar.setExpression(e)] as [string, () => void]))
  row((['wave', 'namaste', 'snap', 'thumbs_up', 'talk1', 'talk2', 'present', 'point'] as Gesture[]).map((g) => [g, () => avatar.play(g)] as [string, () => void]))
  row([['face close-up', () => stage.setCloseUp(!stage.isCloseUp())], ['blink', () => avatar.blinkNow()], ['greeting', () => void narrator.playSequence(['greet_1', 'greet_2'])], ['full story', () => void narrator.playSequence(narrator.lines.map((l) => l.id))], ['stop', () => narrator.stop()]])
  const fps = document.createElement('small'); fps.className = 'mono'; p.appendChild(fps)
  setInterval(() => { fps.textContent = `${stage.perf.fps.toFixed(0)} fps · ${stage.perf.dpr.toFixed(2)}x`; }, 500)
  document.body.appendChild(p)
}
