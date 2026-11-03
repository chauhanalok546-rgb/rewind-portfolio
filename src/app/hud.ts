import { fx } from '../stage'

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

export function log(line: string) {
  const ul = $('logs'); const li = document.createElement('li'); li.textContent = line; ul.appendChild(li)
  while (ul.children.length > 4) ul.firstElementChild!.remove()
}
export function setStatus(text: string, travelling = false) { const s = $('status'); s.textContent = text; s.classList.toggle('travelling', travelling) }
export function setPlace(text: string) { $('loc').textContent = text }
export function setSignal(text: string) { $('sig').textContent = text }

let yearNow = 2026
export const getYear = () => yearNow
export function setYearInstant(y: number) { yearNow = y; $('year').textContent = String(y) }
/** Odometer-style spin to a year (instant with reduced motion). */
export function animateYear(to: number, ms: number): Promise<void> {
  const from = yearNow
  if (reduced || ms <= 0) { setYearInstant(to); return Promise.resolve() }
  return new Promise((resolve) => {
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3)
      yearNow = Math.round(from + (to - from) * e); $('year').textContent = String(yearNow)
      if (k < 1) requestAnimationFrame(step); else resolve()
    }
    requestAnimationFrame(step)
  })
}
/** Decay a 0..1 effect knob back to 0. */
export function decay(key: 'flare' | 'chrono', ms: number) {
  const t0 = performance.now(), v0 = fx[key]
  const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); fx[key] = v0 * (1 - k); if (k < 1) requestAnimationFrame(step) }
  requestAnimationFrame(step)
}
export function show(id: string) { const el = $(id); el.classList.remove('hidden'); el.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => el.classList.remove('fade-out')) }
export function hide(id: string, ms = 450) {
  const el = $(id); if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()   // never hide a focused element from assistive tech
  el.classList.add('fade-out'); el.setAttribute('aria-hidden', 'true')
  setTimeout(() => { if (el.classList.contains('fade-out')) el.classList.add('hidden') }, ms)
}
/** One white flash: in 200 ms, hold 150 ms, out 700 ms (reduced motion: soft 600 ms fade at 85%). `atPeak` runs behind the light. */
export async function whiteFlash(atPeak: () => void | Promise<void>) {
  const el = $('flash')
  if (reduced) {
    el.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.4 }, { opacity: 0 }], { duration: 600, easing: 'ease-in-out' })
    await wait(240); await atPeak(); await wait(360); return
  }
  const total = 1050
  const a = el.animate([{ opacity: 0 }, { opacity: 1, offset: 200 / total }, { opacity: 1, offset: 350 / total }, { opacity: 0 }], { duration: total, easing: 'linear' })
  await wait(300); await atPeak()
  await a.finished.catch(() => undefined)
}
