import gsap from 'gsap'
import { reduced } from '../app/hud'

/** The time tunnel: cyan and amber streaks rushing past the camera. Reduced motion gets a plain crossfade. */
const cvs = document.createElement('canvas'); cvs.id = 'tunnel'
cvs.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9;pointer-events:none;opacity:0'
document.body.appendChild(cvs)
const ctx = cvs.getContext('2d')!
let raf = 0, speed = 0, running = false
type Streak = { a: number; r: number; v: number; len: number; amber: boolean }
const streaks: Streak[] = []
function resize() { cvs.width = innerWidth * Math.min(devicePixelRatio, 1.5); cvs.height = innerHeight * Math.min(devicePixelRatio, 1.5) }
addEventListener('resize', resize); resize()
const spawn = (): Streak => ({ a: Math.random() * Math.PI * 2, r: 0.02 + Math.random() * 0.1, v: 0.4 + Math.random() * 1.2, len: 0.05 + Math.random() * 0.25, amber: Math.random() < 0.3 })
for (let i = 0; i < 170; i++) streaks.push(spawn())
let last = 0
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  const w = cvs.width, h = cvs.height, cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) / 2
  ctx.clearRect(0, 0, w, h)
  ctx.lineCap = 'round'
  for (const s of streaks) {
    s.r += s.v * speed * dt * (0.4 + s.r * 2.2)
    if (s.r > 1.1) Object.assign(s, spawn())
    const r0 = s.r * R, r1 = Math.min(1.2, s.r + s.len * speed * 0.35) * R
    const a = Math.min(1, s.r * 2.4)
    ctx.strokeStyle = s.amber ? `rgba(255,176,32,${a * 0.9})` : `rgba(0,180,255,${a * 0.9})`
    ctx.lineWidth = (0.5 + s.r * 2.6) * (w / 1200)
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); ctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); ctx.stroke()
  }
  if (running) raf = requestAnimationFrame(frame)
}
export const tunnel = {
  start(ms = 500) {
    running = true; last = performance.now(); cancelAnimationFrame(raf)
    if (reduced) { gsap.to(cvs, { opacity: 0.35, duration: ms / 1000 }); ctx.clearRect(0, 0, cvs.width, cvs.height); return }
    raf = requestAnimationFrame(frame); gsap.to(cvs, { opacity: 1, duration: ms / 1000 }); gsap.to({ v: speed }, { v: 2.6, duration: 1.1, ease: 'power2.in', onUpdate() { speed = (this as unknown as { targets: () => Array<{ v: number }> }).targets()[0].v } })
  },
  stop(ms = 700) {
    gsap.to(cvs, { opacity: 0, duration: ms / 1000, onComplete: () => { running = false; cancelAnimationFrame(raf); speed = 0 } })
  },
}
