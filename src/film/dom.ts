import gsap from 'gsap'

/** Build an element from an HTML string. */
export function h<T extends HTMLElement = HTMLElement>(html: string, parent?: HTMLElement): T {
  const t = document.createElement('template'); t.innerHTML = html.trim()
  const el = t.content.firstElementChild as T
  parent?.appendChild(el); return el
}

/** Jagged mountain ridge as an SVG path (deterministic from a seed so it never flickers). */
export function ridge(seed: number, base: number, amp: number, peaks = 7, w = 1600, h = 600): string {
  let s = seed * 9301 + 49297
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  let d = `M0 ${h} L0 ${base}`
  const step = w / peaks
  for (let i = 0; i <= peaks; i++) {
    const x = i * step
    d += ` L${x - step * 0.5 + rnd() * step * 0.2} ${base - amp * (0.3 + rnd() * 0.7) * 0.55} L${x} ${base - amp * (0.5 + rnd() * 0.5)}`
  }
  return d + ` L${w} ${h} Z`
}

/** Layered mountains: back to front, each layer drifts a little for parallax. */
export function mountains(colors: string[], snow = false): string {
  const layers = colors.map((c, i) => {
    const base = 330 + i * 70, amp = 280 - i * 55
    return `<path class="ml l${i}" d="${ridge(i + 3, base, amp, 6 + i)}" fill="${c}"/>${snow && i < 2 ? `<path d="${ridge(i + 3, base, amp, 6 + i)}" fill="url(#snow)" opacity="0.55"/>` : ''}`
  }).join('')
  return `<svg class="mount" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>${layers}</svg>`
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export { gsap }
