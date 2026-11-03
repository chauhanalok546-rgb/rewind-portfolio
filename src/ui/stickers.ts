import { sfx } from '../audio/sfx'

interface StickerDef { id: string; label: string; toast: string; bg: string; fg: string; glyph: string; pos: string; rot: number }

const G = (inner: string) => inner
const STICKERS: StickerDef[] = [
  { id: 'hourglass', label: 'Hourglass', toast: 'Runtime: 18 years and counting.', bg: '#ffb020', fg: '#0e1726', pos: 'left:2.2%;top:27%', rot: -7,
    glyph: G('<path d="M20 16h24M20 48h24M22 16c0 10 8 12 10 16-2 4-10 6-10 16M42 16c0 10-8 12-10 16 2 4 10 6 10 16" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M26 44c2-3 10-3 12 0v4H26z" fill="currentColor"/>') },
  { id: 'atom', label: 'Atom', toast: 'Built from Python, Java and curiosity.', bg: '#00b4ff', fg: '#0e1726', pos: 'left:6.6%;top:41%', rot: 6,
    glyph: G('<g fill="none" stroke="currentColor" stroke-width="3"><ellipse cx="32" cy="32" rx="18" ry="7"/><ellipse cx="32" cy="32" rx="18" ry="7" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="18" ry="7" transform="rotate(120 32 32)"/></g><circle cx="32" cy="32" r="4.5" fill="currentColor"/>') },
  { id: 'knight', label: 'Chess knight', toast: 'Taught by his grandfather. Thinks before he moves.', bg: '#0e1726', fg: '#f5f8fc', pos: 'left:2.2%;top:55%', rot: -5,
    glyph: G('<path d="M22 50h22v-5H22zM24 44c0-8 2-12 8-16-3 0-6-2-8-5l8-9 4 4 7 2c4 8 4 18 4 24z" fill="currentColor"/><circle cx="35" cy="22" r="1.8" fill="#0e1726"/>') },
  { id: 'ball', label: 'Basketball', toast: 'Power forward and center. CBSE Nationals.', bg: '#ffb020', fg: '#0e1726', pos: 'left:6.6%;top:69%', rot: 8,
    glyph: G('<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="32" cy="32" r="17"/><path d="M15 32h34M32 15v34M20 20c6 6 6 18 0 24M44 20c-6 6-6 18 0 24"/></g>') },
  { id: 'peak', label: 'Mountain peak', toast: '14 days at the Nehru Institute of Mountaineering.', bg: '#00b4ff', fg: '#f5f8fc', pos: 'right:2.2%;top:27%', rot: 7,
    glyph: G('<path d="M10 48l14-24 8 12 6-8 16 20z" fill="currentColor"/><path d="M24 24l-4 7 4-2 3 3z" fill="#0e1726" opacity="0.45"/>') },
  { id: 'beaker', label: 'Beaker', toast: 'Experiment in progress: one alpha a day on WorldQuant BRAIN.', bg: '#f5f8fc', fg: '#0e1726', pos: 'right:6.6%;top:41%', rot: -6,
    glyph: G('<path d="M26 14h12M28 14v14L17 48a3 3 0 0 0 3 4h24a3 3 0 0 0 3-4L36 28V14" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M21 42h22l4 7a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3z" fill="#00b4ff"/>') },
  { id: 'wormhole', label: 'Wormhole ring', toast: 'Paradox risk: low. Proceed.', bg: '#0e1726', fg: '#00b4ff', pos: 'right:2.2%;top:55%', rot: 5,
    glyph: G('<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="12" stroke="#ffb020"/><circle cx="32" cy="32" r="6"/></g><circle cx="32" cy="32" r="2" fill="#f5f8fc"/>') },
  { id: 'arm01', label: 'ARM-01 robot badge', toast: 'ARM-01, onboard assistant. Says hi.', bg: '#ffb020', fg: '#0e1726', pos: 'right:6.6%;top:69%', rot: -8,
    glyph: G('<rect x="16" y="20" width="32" height="26" rx="8" fill="currentColor"/><circle cx="26" cy="33" r="4" fill="#00b4ff"/><circle cx="38" cy="33" r="4" fill="#00b4ff"/><path d="M32 20v-6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="12" r="3" fill="currentColor"/><path d="M28 41h8" stroke="#f5f8fc" stroke-width="2.5" stroke-linecap="round"/>') },
]

function svg(s: StickerDef) {
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="3" width="58" height="58" rx="17" fill="${s.bg}"/>
    <rect x="3" y="3" width="58" height="58" rx="17" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
    <ellipse cx="26" cy="14" rx="20" ry="8" fill="#fff" opacity=".28"/>
    <g style="color:${s.fg}">${s.glyph}</g></svg>`
}

function burst(x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const sp = document.createElement('i'); sp.className = 'spark'
    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4, d = 34 + Math.random() * 26
    sp.style.left = x - 3 + 'px'; sp.style.top = y - 3 + 'px'
    sp.style.setProperty('--dx', Math.cos(a) * d + 'px'); sp.style.setProperty('--dy', Math.sin(a) * d + 'px')
    document.body.appendChild(sp); setTimeout(() => sp.remove(), 700)
  }
}

export function toast(text: string) {
  const host = document.getElementById('toasts')!
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text
  host.replaceChildren(t); setTimeout(() => t.remove(), 3300)
}

export function mountStickers() {
  const host = document.getElementById('stickers')!
  for (const s of STICKERS) {
    const b = document.createElement('button'); b.className = 'sticker'; b.setAttribute('aria-label', s.label + ': show a fact')
    b.style.cssText = s.pos + `;--r:${s.rot}deg`; b.innerHTML = svg(s)
    b.addEventListener('click', () => {
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop')
      const r = b.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2)
      toast(s.toast); sfx.chime()
    })
    host.appendChild(b)
  }
}
