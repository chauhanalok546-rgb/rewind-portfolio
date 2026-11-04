import { gsap, h, mountains } from './dom'
import type { Mood } from '../audio/music'
import { reduced, setSignal } from '../app/hud'
import { Vector3 } from 'three'
import { stage } from '../stage'
import { takeVideo } from './warm'

export interface SceneCtx {
  id: string
  sets: HTMLElement
  props: HTMLElement
  tl: gsap.core.Timeline
  /** scene-local second at which narration line `i` starts (+ optional offset) */
  at(line: number, off?: number): number
  add<T extends HTMLElement = HTMLElement>(html: string, layer?: 'sets' | 'props'): T
  word(w: string): void
  music(m: Mood): void
  type(el: HTMLElement, text: string, start: number, dur: number): void
  banner(text: string, sub?: string): void
  /** run when the scene is torn down (a jump, travel or replay): used to put the 3D props away */
  onDispose(fn: () => void): void
}
export interface SceneDef {
  id: string; year: number; place: string
  lines: string[]
  music: Mood
  extra?: number          // extra seconds after the last line (for interactive moments that need time)
  avatar: 'lobby' | { x: number; yaw: number }
  enter(c: SceneCtx): void
}

/** Phase 8: a Blender-rendered establishing shot loops behind the scene. It only replaces the CSS art once it can play;
 *  with reduced motion, data-saver or any video error the hand-made CSS backdrop stays as it was. */
function backdrop(set: HTMLElement, name: string) {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (reduced || nav.connection?.saveData) return
  const v = takeVideo(name) ?? document.createElement('video')                    // normally an element that was loaded and decoded earlier
  if (!v.src) { v.className = 'bgvid'; v.src = `/video/${name}.mp4`; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('aria-hidden', 'true') }
  v.autoplay = true; v.currentTime = 0
  v.addEventListener('playing', () => set.classList.add('has-video'), { once: true })
  v.addEventListener('error', () => v.remove(), { once: true })
  set.prepend(v); void v.play().catch(() => v.remove())
}
const sky = (c: string[]) => `linear-gradient(180deg, ${c.join(', ')})`
const card = (cls: string, inner: string) => `<div class="prop card2 ${cls}">${inner}</div>`
const pop = (c: SceneCtx, el: HTMLElement, t: number, out?: number) => {
  c.tl.fromTo(el, { autoAlpha: 0, y: 24, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.5)' }, t)
  if (out) c.tl.to(el, { autoAlpha: 0, y: -16, duration: 0.5, ease: 'power2.in' }, out)
}

/* ------------------------------------------------------------------ scene 0 */
const scene0: SceneDef = {
  id: 'scene0', year: 2026, place: 'Pune, IN', lines: ['s0_1', 's0_2', 's0_3'], music: 'glitch', avatar: 'lobby',
  enter(c) {
    c.add('<div class="dimmer"></div>', 'sets')
    c.add('<div class="ripples"><i></i><i></i><i></i></div>', 'sets')
    const term = c.add<HTMLElement>(`<div class="prop term right"><div class="term-head mono">alok.os · boot</div><pre class="mono"></pre></div>`)
    const pre = term.querySelector('pre') as HTMLElement
    c.tl.fromTo(term, { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: 0.8, ease: 'power3.out' }, 0.4)
    c.type(pre, 'booting alok.os v18\ncalibrating robotic arm ✓\n', 0.8, 2.2)
    const sig = c.add<HTMLElement>(`<div class="prop term-signal right mono">incoming signal · origin: 2030 · integrity 12%</div>`)
    c.tl.fromTo(sig, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, repeat: 5, yoyo: true }, 3.2).to(sig, { autoAlpha: 1, duration: 0.1 })
    const hint = c.add(`<div class="prop hint">${document.documentElement.dataset.voice === 'on' ? 'Say a year to jump, or just watch.' : 'Tap a year below to jump, or just watch.'}</div>`)
    c.tl.fromTo(hint, { autoAlpha: 0 }, { autoAlpha: 0.9, duration: 1 }, c.at(2, 0.5))
  },
}

/* ------------------------------------------------------------------ scene 1 */
const scene1: SceneDef = {
  id: 'scene1', year: 2015, place: 'Uttarkashi, IN', lines: ['s1_1', 's1_2', 's1_3', 's1_4'], music: 'piano', avatar: { x: -1.0, yaw: 0.35 },
  enter(c) {
    const set = c.add<HTMLElement>(`<div class="set" style="background:${sky(['#ffcf9e', '#ffe6c4', '#f9efe0'])}">
      <div class="sun"></div>${mountains(['#b6c3d6', '#8da3c1', '#647fa6', '#3f5a82'])}
      <svg class="house" viewBox="0 0 160 110"><path d="M10 100V55l70-42 70 42v45z" fill="#4a3a30"/><path d="M0 58l80-48 80 48" fill="none" stroke="#2a211b" stroke-width="7" stroke-linejoin="round"/><rect x="62" y="62" width="36" height="38" fill="#ffb020"><animate attributeName="opacity" values=".85;1;.85" dur="3s" repeatCount="indefinite"/></rect></svg></div>`, 'sets')
    backdrop(set, 'scene1')
    c.tl.fromTo(set, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2 }, 0)
    c.banner('Uttarkashi', '2015')
    // chess: a real 3D board; the white e-pawn moves two squares by itself after a few seconds, or when the visitor clicks the board
    const chess = stage.props.chess
    const label = c.add<HTMLElement>(`<div class="prop chess3d mono"><div class="eyebrow">first lesson: think before you move</div><div class="tap">click the board to push the pawn</div></div>`)
    gsap.set(label, { autoAlpha: 0 })
    const advance = () => {
      if (chess.moved) return
      void chess.push().then(() => c.word('curious')); const tap = label.querySelector('.tap') as HTMLElement | null; if (tap) tap.style.display = 'none'
    }
    chess.onPick = advance
    c.tl.call(() => { chess.show(true); gsap.to(label, { autoAlpha: 1, duration: 0.6 }) }, [], c.at(1, 0.8))
    c.tl.call(advance, [], c.at(1, 4.6))
    c.tl.call(() => { chess.show(false); chess.onPick = null; gsap.to(label, { autoAlpha: 0, duration: 0.4 }) }, [], c.at(2, 0.2))
    c.onDispose(() => { chess.show(false); chess.onPick = null })
    // puzzles and olympiads
    const puzzle = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">newspaper · puzzle corner</div><div class="sudoku">${'<i></i>'.repeat(16)}</div><div class="sheets mono">olympiad sheets ✎</div>`))
    const cells = puzzle.querySelectorAll('.sudoku i')
    ;[1, 6, 8, 11, 13].forEach((i, k) => { cells[i].textContent = String(k % 4 + 1) })
    pop(c, puzzle, c.at(2, 0.4), c.at(3, 4.5))
    c.tl.to(Array.from(cells), { backgroundColor: 'rgba(255,176,32,.35)', stagger: 0.18, duration: 0.4 }, c.at(2, 1.2))
  },
}

/* ------------------------------------------------------------------ scene 2 */
const JAVA = ['public class Hello {', '  public static void main(String[] a) {', '    System.out.println("Hello, World");', '  }', '}']
const scene2: SceneDef = {
  id: 'scene2', year: 2023, place: 'Uttarkashi, IN', lines: ['s2_1', 's2_2', 's2_3', 's2_4', 's2_5'], music: 'strings', avatar: { x: -1.0, yaw: 0.35 },
  enter(c) {
    const hall = c.add<HTMLElement>(`<div class="set" style="background:radial-gradient(ellipse at 60% 30%, #3a4a68 0%, #151f33 60%, #0b111c 100%)"><div class="spot"></div></div>`, 'sets')
    backdrop(hall, 'scene2')
    c.tl.fromTo(hall, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 0)
    c.banner('MDS Uttarkashi', 'Class 9 and 10')
    // beat 1: school chess championship, the trophy glints
    const trophy = c.add<HTMLElement>(card('right trophy', `<svg viewBox="0 0 120 120"><path d="M34 18h52v24c0 20-12 30-26 30S34 62 34 42z" fill="#ffb020"/><path d="M34 26H18c0 20 8 28 20 30M86 26h16c0 20-8 28-20 30" fill="none" stroke="#ffb020" stroke-width="6"/><rect x="54" y="72" width="12" height="18" fill="#ffb020"/><rect x="38" y="90" width="44" height="10" rx="3" fill="#0e1726" stroke="#ffb020" stroke-width="3"/><rect class="glint" x="30" y="10" width="14" height="110" fill="#fff" opacity=".6" transform="rotate(20 60 60)"/></svg><div class="eyebrow mono">Class 9</div><h3>Intra-school chess championship</h3>`))
    pop(c, trophy, c.at(0, 0.4), c.at(0, 5.2))
    c.tl.fromTo(trophy.querySelector('.glint'), { x: -40 }, { x: 110, duration: 1.1, repeat: 2, repeatDelay: 0.8, ease: 'power1.inOut' }, c.at(0, 1))
    // beat 2: the computer lab, first Java program
    const ed = c.add<HTMLElement>(card('right editor', `<div class="ed-head mono"><i></i><i></i><i></i> Hello.java <button class="run mono">Run ▶</button></div><pre class="mono code"></pre><div class="ok mono">✓ compiled · Hello, World</div>`))
    const code = ed.querySelector('.code') as HTMLElement, ok = ed.querySelector('.ok') as HTMLElement
    let compiled = false
    const compile = () => { if (compiled) return; compiled = true; gsap.to(ok, { autoAlpha: 1, y: 0, duration: 0.4 }); c.word('builder') }
    ed.querySelector('.run')!.addEventListener('click', compile)
    pop(c, ed, c.at(1, 0.2), c.at(2, 2.5))
    c.type(code, JAVA.join('\n'), c.at(1, 0.9), 3.3)
    c.tl.call(compile, [], c.at(1, 4.6))
    // beat 3: the result board
    const board = c.add<HTMLElement>(card('right result', `<div class="eyebrow mono">result board</div><h3>Class X</h3><div class="big">93%</div>`))
    pop(c, board, c.at(2, 0.4), c.at(3, 0.2))
    // beat 4: snow and ropes
    const snow = c.add<HTMLElement>(`<div class="set" style="background:${sky(['#c9dcf2', '#e9f2fb', '#ffffff'])}"><div class="flakes"></div></div>`, 'sets')
    c.tl.fromTo(snow, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.4 }, c.at(3, 0))
    const peaks = stage.props.mountains                                                    // real 3D peaks, a rope route and a climber's light
    c.tl.call(() => { peaks.show(true); peaks.climb(11) }, [], c.at(3, 0.3))
    c.onDispose(() => peaks.show(false))
    const note = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">ARM-01</div><h3>❄ Not built for snow.</h3>`))
    pop(c, note, c.at(3, 0.3), c.at(4, 0.2))
    const nim = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">basic mountaineering course</div><h3>Nehru Institute of Mountaineering</h3><div class="big">14 days</div>`))
    pop(c, nim, c.at(4, 0.4))
  },
}

/* ------------------------------------------------------------------ scene 3 */
const scene3: SceneDef = {
  id: 'scene3', year: 2024, place: 'Dehradun, IN', lines: ['s3_1', 's3_2', 's3_3', 's3_4', 's3_5', 's3_6'], music: 'crowd', avatar: { x: -1.0, yaw: 0.35 },
  enter(c) {
    const set = c.add<HTMLElement>(`<div class="set" style="background:${sky(['#2a3b5a', '#4a5f84', '#d8c9b4'])}"><div class="skyline"></div>
      <svg class="bus" viewBox="0 0 220 90"><rect x="6" y="14" width="200" height="52" rx="12" fill="#ffb020"/><g fill="#0e1726" opacity=".85"><rect x="20" y="24" width="30" height="20" rx="3"/><rect x="58" y="24" width="30" height="20" rx="3"/><rect x="96" y="24" width="30" height="20" rx="3"/><rect x="134" y="24" width="30" height="20" rx="3"/></g><circle cx="52" cy="70" r="12" fill="#0e1726"/><circle cx="156" cy="70" r="12" fill="#0e1726"/></svg><div class="road"></div></div>`, 'sets')
    backdrop(set, 'scene3')
    c.tl.fromTo(set, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 0)
    c.tl.fromTo(set.querySelector('.bus'), { x: '-30vw' }, { x: '115vw', duration: 8, ease: 'none' }, 0.2)
    c.banner('Dehradun', 'Asian School · Classes 11 and 12')
    const dorm = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">new city · new hostel</div><h3>Same habits.</h3><div class="mono dim">a chessboard on the desk ♟</div>`))
    pop(c, dorm, c.at(0, 4.2), c.at(1, 0.2))
    // basketball: a real 3D court and hoop; one shot goes up by itself after a few seconds, or the visitor clicks the court to take it
    const court = stage.props.court
    const tapHint = c.add<HTMLElement>(`<div class="prop chess3d mono"><div class="eyebrow">power forward · center</div><div class="tap">click the court to take the shot</div></div>`)
    gsap.set(tapHint, { autoAlpha: 0 })
    const shoot = () => {
      if (court.shot) return
      void court.shoot().then(() => c.word('resilient')); const tap = tapHint.querySelector('.tap') as HTMLElement | null; if (tap) tap.style.display = 'none'
    }
    court.onPick = shoot
    c.tl.call(() => { court.show(true); gsap.to(tapHint, { autoAlpha: 1, duration: 0.6 }) }, [], c.at(1, 0.6))
    c.tl.call(shoot, [], c.at(1, 4.2))
    c.tl.call(() => { court.show(false); court.onPick = null; gsap.to(tapHint, { autoAlpha: 0, duration: 0.4 }) }, [], c.at(2, 0.1))
    c.onDispose(() => { court.show(false); court.onPick = null })
    const score = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">scoreboard</div><h3>CBSE cluster final: won</h3><div class="banner">CBSE Nationals</div>`))
    pop(c, score, c.at(1, 7), c.at(2, 0.1))
    const xii = c.add<HTMLElement>(card('right result', `<div class="eyebrow mono">result board</div><h3>Class XII</h3><div class="big">90%</div>`))
    pop(c, xii, c.at(2, 0.3), c.at(3, 0.2))
    // NDA and SSB
    const nda = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">late-night study · NDA books</div><h3>NDA written: Qualified</h3><div class="mono dim">group tasks · interview · psychological tests</div>`))
    pop(c, nda, c.at(3, 0.4), c.at(4, 0.1))
    const stamp = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">1 AFSB Dehradun</div><div class="stamp">Recommended<small>1st attempt</small></div>`))
    pop(c, stamp, c.at(4, 0.2), c.at(4, 3.4))
    // the fork: the timeline cracks in two (kept short and dignified)
    const tlv = c.add<HTMLElement>(`<svg class="prop timeline" viewBox="0 0 800 160" preserveAspectRatio="xMidYMid meet"><path class="seg a" d="M30 90 H410" /><path class="seg b" d="M410 90 H770"/><circle class="node" cx="30" cy="90" r="7"/></svg>`)
    c.tl.fromTo(tlv, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, c.at(4, 0.4))
    const med = c.add<HTMLElement>(card('right med', `<div class="eyebrow mono">medical stage</div><h3>Medically out</h3>`))
    c.tl.call(() => c.music('silence'), [], c.at(4, 3.2))
    pop(c, med, c.at(4, 3.4), c.at(5, 0.2))
    c.tl.to(tlv.querySelector('.b'), { y: 26, rotation: 7, transformOrigin: '410px 90px', duration: 0.9, ease: 'power3.in' }, c.at(4, 3.6))
    c.tl.call(() => c.music('lift'), [], c.at(5, 0.3))
    c.tl.to(tlv.querySelector('.b'), { y: -26, rotation: -9, duration: 1.4, ease: 'power3.out', attr: { d: 'M410 90 C 520 90 560 40 770 40' } }, c.at(5, 0.5))
    c.tl.to(tlv.querySelector('.seg'), { stroke: '#00b4ff', strokeWidth: 6, duration: 1 }, c.at(5, 0.6))
    const next = c.add<HTMLElement>(`<div class="prop route mono">→ Pune</div>`)
    c.tl.fromTo(next, { autoAlpha: 0, x: -20 }, { autoAlpha: 1, x: 0, duration: 0.8 }, c.at(5, 3.2))
  },
}

/* ------------------------------------------------------------------ scene 4 */
const scene4: SceneDef = {
  id: 'scene4', year: 2026, place: 'Pune, IN', lines: ['s4_1', 's4_2', 's4_3', 's4_4', 's4_5', 's4_6'], music: 'beat', extra: 5, avatar: { x: -1.0, yaw: 0.35 },
  enter(c) {
    const set = c.add<HTMLElement>(`<div class="set" style="background:radial-gradient(ellipse at 70% 30%, #12213a 0%, #070c16 70%)"><div class="codefall"></div></div>`, 'sets')
    backdrop(set, 'scene4')
    c.tl.fromTo(set, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, 0)
    c.banner('Newton School of Technology', 'Pune · first year of Computer Science')
    // Scratchathon: 80 teams, 10 reach the final presentation
    const sc = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">Scratchathon · game-building hackathon</div><div class="dots">${'<i></i>'.repeat(80)}</div><h3>Round 1 cleared · selected for final presentation</h3>`))
    const dots = Array.from(sc.querySelectorAll('.dots i'))
    pop(c, sc, c.at(1, 0.3), c.at(2, 0.1))
    c.tl.to(dots.slice(10), { scale: 0.2, autoAlpha: 0.15, duration: 0.5, stagger: 0.015 }, c.at(1, 1.8))
    c.tl.to(dots.slice(0, 10), { backgroundColor: '#ffb020', scale: 1.35, duration: 0.5, stagger: 0.05 }, c.at(1, 3.2))
    const hk = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">Hacktoberfest hackathon · NST</div><div class="stamp">Round 1 cleared</div>`))
    pop(c, hk, c.at(2, 0.2), c.at(3, 0.1))
    // Bug Slayer
    const bs = c.add<HTMLElement>(card('right term2', `<div class="eyebrow mono">Bug Slayer · README in a sandbox</div><pre class="mono"></pre>`))
    const pre = bs.querySelector('pre') as HTMLElement
    pop(c, bs, c.at(3, 0.2), c.at(4, 0.1))
    c.type(pre, '0/3 steps passed\n', c.at(3, 1.2), 1.0)
    c.type(pre, '✓ README patched\n', c.at(3, 4.2), 1.0)
    // projects, open source, one alpha a day
    const pr = c.add<HTMLElement>(card('right projects', `<div class="eyebrow mono">projects</div><div class="grid2"><b>CampusCompass</b><b>broken-readme</b><b>git-demo-hopper</b><b>this portfolio</b></div><div class="eyebrow mono">open source · one pull request at a time</div><div class="contrib"></div><div class="eyebrow mono">WorldQuant BRAIN · a new alpha every day</div><div class="streak mono"></div>`))
    const contrib = pr.querySelector('.contrib') as HTMLElement, streak = pr.querySelector('.streak') as HTMLElement
    for (let i = 0; i < 7 * 20; i++) h('<i></i>', contrib)
    for (let i = 0; i < 14; i++) h('<span>α</span>', streak)
    pop(c, pr, c.at(4, 0.2), c.at(5, 0.1))
    const cells = Array.from(contrib.children)
    c.tl.to(cells, { backgroundColor: (i: number) => ['rgba(0,180,255,.25)', 'rgba(0,180,255,.55)', '#00b4ff', '#ffb020'][(i * 7) % 4], stagger: 0.012, duration: 0.3 }, c.at(4, 1.2))
    c.tl.to(Array.from(streak.children), { color: '#ffb020', opacity: 1, stagger: 0.22, duration: 0.25 }, c.at(4, 3))
    // what he does when he switches off
    const hb = c.add<HTMLElement>(card('right', `<div class="eyebrow mono">when I switch off</div><div class="hobbies"><div><div class="sudoku small">${'<i></i>'.repeat(9)}</div><small>sudoku</small></div><div><div class="reel"><i></i><i></i><i></i></div><small>video editing</small></div><div><div class="clock mono">05:00</div><small>chess</small></div></div>`))
    pop(c, hb, c.at(5, 0.1), c.at(5, 2.5))
    const sd = Array.from(hb.querySelectorAll('.sudoku i'))
    c.tl.to(sd, { backgroundColor: 'rgba(255,176,32,.4)', stagger: 0.18, duration: 0.3 }, c.at(5, 1))
    const clk = hb.querySelector('.clock') as HTMLElement
    c.tl.to({ s: 300 }, { s: 296, duration: 4, ease: 'none', onUpdate() { const s = Math.round((this as unknown as { targets: () => Array<{ s: number }> }).targets()[0].s); clk.textContent = `0${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` } }, c.at(5, 0.4))
    // the scratch card
    const file = c.add<HTMLElement>(card('right scratch', `<div class="eyebrow mono">File 018 · Declassified</div><div class="reveal">Cleared SSB. Climbed mountains. Now debugging READMEs.</div><canvas></canvas><div class="tap mono">scratch to reveal</div>`))
    const cv = file.querySelector('canvas') as HTMLCanvasElement
    const tap = file.querySelector('.tap') as HTMLElement
    let revealed = false
    const setup = () => {
      const r = cv.getBoundingClientRect(); cv.width = Math.max(10, r.width); cv.height = Math.max(10, r.height)
      const g = cv.getContext('2d')!; const gr = g.createLinearGradient(0, 0, cv.width, cv.height); gr.addColorStop(0, '#9fb0c8'); gr.addColorStop(1, '#6c7f9c')
      g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = 'rgba(14,23,38,.55)'; g.font = '700 22px JetBrains Mono, monospace'; g.textAlign = 'center'; g.fillText('CLASSIFIED', cv.width / 2, cv.height / 2 + 7)
    }
    const scratchAt = (x: number, y: number) => { const g = cv.getContext('2d')!; g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill() }
    const done = () => { if (revealed) return; revealed = true; tap.style.display = 'none'; gsap.to(cv, { autoAlpha: 0, duration: 0.6 }); c.word('consistent') }
    let down = false, strokes = 0
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId) })
    cv.addEventListener('pointerup', () => { down = false })
    cv.addEventListener('pointermove', (e) => { if (!down) return; const r = cv.getBoundingClientRect(); scratchAt(e.clientX - r.left, e.clientY - r.top); if (++strokes > 45) done() })
    c.tl.call(() => { setup(); }, [], c.at(5, 2.9))
    c.tl.fromTo(file, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'back.out(1.5)' }, c.at(5, 2.8))
    // it scratches itself open after 3 s if nobody does
    const auto = { p: 0 }
    c.tl.to(auto, { p: 1, duration: 2.2, ease: 'none', onUpdate: () => { if (revealed || !cv.width) return; const w = cv.width, hh = cv.height; for (let k = 0; k < 3; k++) { const t = auto.p * 6 + k * 0.4; scratchAt(((t * 0.37) % 1) * w, (0.2 + 0.6 * Math.abs(Math.sin(t * 2.1))) * hh) } }, onComplete: done }, c.at(5, 5.9))
  },
}

/* ------------------------------------------------------------------ scene 5 */
const scene5: SceneDef = {
  id: 'scene5', year: 2030, place: 'the future', lines: ['s5_1', 's5_2', 's5_3', 's5_4'], music: 'swell', avatar: { x: -1.0, yaw: 0.35 },
  enter(c) {
    const set = c.add<HTMLElement>(`<div class="set" style="background:radial-gradient(ellipse at 60% 40%, #16264a 0%, #070c16 70%)"><div class="stars"></div></div>`, 'sets')
    backdrop(set, 'scene5')
    c.tl.fromTo(set, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2 }, 0)
    c.banner('Timelines not yet written', 'the future')
    const map = c.add<HTMLElement>(`<svg class="prop map right" viewBox="0 0 520 380" xmlns="http://www.w3.org/2000/svg">
      <path class="p solid" d="M20 200 H150"/>
      <path class="p solid a" d="M150 200 C 220 200 230 110 330 110" />
      <path class="p wispr" d="M150 200 C 230 200 250 200 340 200" />
      <path class="p dotted" d="M150 200 C 220 200 230 300 330 300" />
      <path class="p dotted c" d="M330 300 C 400 300 410 330 470 330" />
      <circle class="n" cx="20" cy="200" r="8"/><circle class="n now" cx="150" cy="200" r="9"/>
      <circle class="n gsoc" cx="330" cy="110" r="10"/><circle class="n wf" cx="340" cy="200" r="12"/><circle class="n own" cx="470" cy="330" r="12"/>
      <text x="14" y="228">2026</text><text x="256" y="92" class="lbl">Google Summer of Code</text><text x="256" y="106" class="lbl2">Next</text>
      <text x="310" y="234" class="lbl wl">Wispr Flow</text><text x="340" y="320" class="lbl">my own product</text>
      <g transform="translate(346 200)"><g class="wave"><path d="M0 0 q10 -26 20 0 t20 0 t20 0 t20 0" fill="none" stroke="#00b4ff" stroke-width="2.5"/></g></g></svg>`)
    c.tl.fromTo(map, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, c.at(0, 0.4))
    c.tl.fromTo(map.querySelectorAll('.p'), { strokeDashoffset: 400, strokeDasharray: '400' }, { strokeDashoffset: 0, duration: 1.6, stagger: 0.3, ease: 'power2.out' }, c.at(0, 0.6))
    c.tl.fromTo(map.querySelector('.gsoc'), { scale: 0.4, transformOrigin: 'center' }, { scale: 1.4, repeat: -1, yoyo: true, duration: 0.9, ease: 'sine.inOut' }, c.at(0, 1.4))
    c.tl.fromTo(map.querySelector('.wave'), { x: 0 }, { x: 8, repeat: -1, yoyo: true, duration: 0.5, ease: 'sine.inOut' }, c.at(2, 0.2))
    c.tl.to(map.querySelector('.wispr'), { stroke: '#00b4ff', strokeWidth: 6, duration: 0.8 }, c.at(2, 0.4))
    c.tl.fromTo(map.querySelector('.own'), { strokeDasharray: '4 4' }, { strokeDashoffset: -40, duration: 3, ease: 'none', repeat: -1 }, c.at(1, 3))
    // 2030 signal, decoded by "Show me" (or by itself after 3 s)
    const sig = c.add<HTMLElement>(card('right signal', `<div class="eyebrow mono">signal · origin 2030</div><div class="meter"><i></i></div><div class="pct mono">integrity 12%</div><button class="btn primary small">Show me · decode the signal</button>`))
    const meter = sig.querySelector('.meter i') as HTMLElement, pct = sig.querySelector('.pct') as HTMLElement
    gsap.set(meter, { width: '12%' })
    let decoded = false
    const decode = () => {
      if (decoded) return; decoded = true; (sig.querySelector('button') as HTMLElement).style.display = 'none'
      const o = { v: 12 }; gsap.to(o, { v: 100, duration: 2, ease: 'power2.inOut', onUpdate: () => { meter.style.width = o.v + '%'; pct.textContent = `integrity ${Math.round(o.v)}%`; setSignal(Math.round(o.v) + '%') }, onComplete: () => c.word('ambitious') })
    }
    sig.querySelector('button')!.addEventListener('click', decode)
    document.addEventListener('film:decode', decode, { once: true })       // "Show me" by voice
    pop(c, sig, c.at(2, 5.5), undefined)
    c.tl.call(decode, [], c.at(2, 8.8))
  },
}

/* ------------------------------------------------------------------ scene 6 */
const scene6: SceneDef = {
  id: 'scene6', year: 2026, place: 'Pune, IN', lines: ['s6_1', 's6_2', 's6_3'], music: 'calm', avatar: 'lobby',
  enter(c) {
    c.banner('Return to present', '2026')
    c.tl.call(() => stage.machine.setActive(true), [], c.at(1, 0.5))
    // ARM-01 builds the sentence from scattered words
    const words = ["Let's", 'build', 'something.']
    const arm = c.add<HTMLElement>(`<div class="prop sentence right"><div class="scatter"></div><div class="built mono"></div></div>`)
    const scatter = arm.querySelector('.scatter') as HTMLElement, built = arm.querySelector('.built') as HTMLElement
    const els = words.map((w, i) => h(`<span class="w mono" style="--i:${i}">${w}</span>`, scatter))
    c.tl.fromTo(arm, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, c.at(1, 0.2))
    els.forEach((e, i) => {
      c.tl.to(e, { autoAlpha: 0, duration: 0.25 }, c.at(1, 3.5 + i * 1.8))
      c.tl.call(() => { stage.robot.reach(new Vector3(0.6 + i * 0.12, 0.42 + i * 0.1, 0.45), 1.2); built.textContent += (i ? ' ' : '') + words[i] }, [], c.at(1, 3.6 + i * 1.8))
    })
    // contact cards
    const contact = c.add<HTMLElement>(`<div class="prop contact right"><a class="glass cc" href="https://github.com/chauhanalok546-rgb" target="_blank" rel="noopener"><b>GitHub</b><span class="mono">chauhanalok546-rgb</span></a><a class="glass cc" href="https://linkedin.com/in/alok-chauhan-72a9603a1" target="_blank" rel="noopener"><b>LinkedIn</b><span class="mono">alok-chauhan-72a9603a1</span></a><button class="btn primary" id="replay">↺ Replay the story</button><p class="mono hint2">${document.documentElement.dataset.voice === 'on' ? 'Say "replay" or "contact", or press R.' : 'Press R to replay.'}</p></div>`)
    c.tl.fromTo(contact.children, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, stagger: 0.18, duration: 0.7, ease: 'back.out(1.4)' }, c.at(2, 0.4))
    contact.querySelector('#replay')!.addEventListener('click', () => document.dispatchEvent(new CustomEvent('film:replay')))
  },
}

export const SCENES: SceneDef[] = [scene0, scene1, scene2, scene3, scene4, scene5, scene6]
