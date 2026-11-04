import * as THREE from 'three'
import gsap from 'gsap'
import { mergeStatic } from './mergeStatic'

/** Real 3D story props, drawn in the live scene next to the avatar: a polished chessboard with turned pieces (the pawn push is a real move),
 *  snow mountains with a rope route and a climber's light, and a basketball court with a hoop, a net and a ball that swishes. Each prop is hidden until its beat. */
const CY = new THREE.Color('#00b4ff'), AM = new THREE.Color('#ffb020')
const led = (c: THREE.Color, k = 2.6) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(k), toneMapped: false })
const phys = (color: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.25, ...o })
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/* ---------------------------------------------------------------- chess */
const lathe = (pts: [number, number][], seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)
const PROFILE: Record<string, [number, number][]> = {
  p: [[0, 0], [.36, 0], [.38, .06], [.3, .12], [.17, .22], [.13, .36], [.2, .42], [.2, .47], [.11, .52], [.19, .6], [.17, .7], [.09, .77], [0, .79]],
  r: [[0, 0], [.4, 0], [.42, .07], [.32, .15], [.25, .22], [.23, .55], [.33, .6], [.33, .66], [.3, .66], [.3, .8], [0, .8]],
  b: [[0, 0], [.4, 0], [.42, .07], [.3, .15], [.2, .3], [.13, .46], [.21, .52], [.14, .58], [.19, .7], [.15, .84], [.05, .94], [0, .96]],
  q: [[0, 0], [.42, 0], [.44, .07], [.32, .16], [.2, .36], [.14, .56], [.24, .62], [.15, .7], [.25, .86], [.3, .98], [.14, 1.0], [0, 1.02]],
  k: [[0, 0], [.43, 0], [.45, .07], [.33, .16], [.21, .38], [.15, .6], [.25, .66], [.16, .74], [.23, .9], [.2, 1.0], [.1, 1.0], [0, 1.0]],
  n: [[0, 0], [.4, 0], [.42, .07], [.31, .15], [.24, .24], [.2, .3], [0, .3]],
}
function piece(kind: string, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group(); const add = (geo: THREE.BufferGeometry, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); g.add(m); return m }
  add(lathe(PROFILE[kind]))
  if (kind === 'r') for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(new THREE.BoxGeometry(.16, .14, .16), [Math.cos(a) * .24, .87, Math.sin(a) * .24], [0, -a, 0]) }
  if (kind === 'b') add(new THREE.SphereGeometry(.07, 16, 12), [0, 1.0, 0])
  if (kind === 'q') { add(new THREE.TorusGeometry(.25, .035, 8, 24), [0, .96, 0], [Math.PI / 2, 0, 0]); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add(new THREE.SphereGeometry(.05, 10, 8), [Math.cos(a) * .27, 1.02, Math.sin(a) * .27]) } }
  if (kind === 'k') { add(new THREE.BoxGeometry(.1, .34, .1), [0, 1.14, 0]); add(new THREE.BoxGeometry(.28, .09, .1), [0, 1.17, 0]) }
  if (kind === 'n') {                                                           // a stylised horse: a neck, a head, a muzzle and two ears
    add(new THREE.CapsuleGeometry(.17, .36, 6, 12), [0, .52, .02], [-.28, 0, 0]); add(new THREE.BoxGeometry(.2, .22, .4), [0, .8, .16], [.3, 0, 0]); add(new THREE.BoxGeometry(.15, .15, .22), [0, .73, .38], [.55, 0, 0])
    add(new THREE.ConeGeometry(.05, .14, 6), [-.07, .98, .05]); add(new THREE.ConeGeometry(.05, .14, 6), [.07, .98, .05])
  }
  return g
}

function createChess() {
  const root = new THREE.Group(); root.visible = false
  const board = new THREE.Group(); root.add(board)
  const S = 0.12, wood = phys('#2a160a', { roughness: 0.5, clearcoat: 0.4 })
  const light = phys('#ecd7ae', { roughness: 0.55, clearcoat: 0.5 }), dark = phys('#7a4a28', { roughness: 0.5, clearcoat: 0.5 })
  const frame = new THREE.Mesh(new THREE.BoxGeometry(S * 8 + 0.16, 0.07, S * 8 + 0.16), wood); frame.position.y = -0.035; board.add(frame)
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) { const sq = new THREE.Mesh(new THREE.BoxGeometry(S, 0.02, S), (f + r) % 2 ? dark : light); sq.position.set((f - 3.5) * S, 0.01, (3.5 - r) * S); board.add(sq) }
  const ivory = phys('#f3ead7', { roughness: 0.3 }), ebony = phys('#17121b', { roughness: 0.22, metalness: 0.25, clearcoat: 1 })
  const order = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']; let hero: THREE.Group | null = null
  const place = (kind: string, f: number, r: number, white: boolean) => {
    const g = piece(kind, white ? ivory : ebony); g.scale.setScalar(S * 0.98); g.position.set((f - 3.5) * S, 0.02, (3.5 - r) * S)
    if (kind === 'n') g.rotation.y = white ? 0 : Math.PI; board.add(g); return g
  }
  for (let f = 0; f < 8; f++) { place(order[f], f, 0, true); const p = place('p', f, 1, true); if (f === 4) hero = p; place(order[f], f, 7, false); place('p', f, 6, false) }
  mergeStatic(board, [hero!])
  const ring = new THREE.Mesh(new THREE.BoxGeometry(S * 8 + 0.2, 0.012, S * 8 + 0.2), led(CY, 1.8)); ring.position.y = -0.075; board.add(ring)
  const glow = new THREE.PointLight('#00b4ff', 0.0, 3); glow.position.set(0, 0.5, 0.2); root.add(glow)
  board.rotation.set(0.8, -0.3, 0); const heroHome = hero!.position.clone()
  const state = { shown: false, moved: false }
  return {
    root, onPick: null as null | (() => void),
    pickables: [board],
    show(on: boolean, instant = false) {
      state.shown = on
      if (on) { state.moved = false; hero!.position.copy(heroHome); root.visible = true; if (instant) return; gsap.fromTo(root.scale, { x: .001, y: .001, z: .001 }, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'back.out(1.5)' }); gsap.to(glow, { intensity: 2.2, duration: 1.2 }) }
      else { gsap.to(root.scale, { x: .001, y: .001, z: .001, duration: instant ? 0.01 : 0.5, ease: 'power2.in', onComplete: () => { if (!state.shown) root.visible = false } }); gsap.to(glow, { intensity: 0, duration: 0.4 }) }
    },
    /** e2 to e4, lifted over the board in an arc */
    push(): Promise<void> {
      if (state.moved || !state.shown) return Promise.resolve(); state.moved = true
      return new Promise((res) => {
        const to = heroHome.z - 2 * S
        gsap.timeline({ onComplete: res }).to(hero!.position, { y: heroHome.y + 0.16, duration: 0.35, ease: 'power2.out' }).to(hero!.position, { z: to, duration: 0.55, ease: 'power2.inOut' }, 0.1).to(hero!.position, { y: heroHome.y, duration: 0.3, ease: 'bounce.out' }, 0.65)
          .fromTo(glow, { intensity: 5 }, { intensity: 2.2, duration: 0.9 }, 0.8)
      })
    },
    get moved() { return state.moved },
    layout(portrait: boolean) { root.position.set(portrait ? 0.0 : 1.1, portrait ? 2.55 : 1.05, portrait ? -0.2 : 0.2); root.userData.base = root.position.y; board.scale.setScalar(portrait ? 0.7 : 1) },
    update(_dt: number, t: number) { if (!root.visible) return; root.position.y = root.userData.base + Math.sin(t * 0.9) * 0.015; board.rotation.y = -0.3 + Math.sin(t * 0.35) * 0.05; ring.scale.x = ring.scale.z = 1 + Math.sin(t * 2) * 0.004 },
  }
}

/* ---------------------------------------------------------------- mountains */
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
const vnoise = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v) }
const ridged = (x: number, y: number, oct = 5) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { t += a * (1 - Math.abs(2 * vnoise(x * f + i * 7.3, y * f + i * 3.1) - 1)); f *= 2.1; a *= 0.5 } return t }

function createMountains() {
  const root = new THREE.Group(); root.visible = false
  const NX = 110, NZ = 56, W = 22, D = 11, Z0 = -2.2
  const h = (x: number, z: number) => { const d = (Z0 - z) / D; return (ridged(x * 0.24 + 3, z * 0.24, 6) * 7.4 * sstep(0.0, 0.6, d) + ridged(x * 0.6, z * 0.6, 3) * 0.45 * d) * (0.55 + 0.45 * sstep(0.05, 0.5, Math.abs(x) / 8 + d * 0.4)) - 0.35 }
  const pos = new Float32Array(NX * NZ * 3), col = new Float32Array(NX * NZ * 3), hs = new Float32Array(NX * NZ)
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = (i / (NX - 1) - 0.5) * W, z = Z0 - (j / (NZ - 1)) * D, y = h(x, z), k = j * NX + i; pos.set([x, y, z], k * 3); hs[k] = y }
  const rock = new THREE.Color('#44557a'), snow = new THREE.Color('#f6f9ff'), shade = new THREE.Color('#8097c0'), haze = new THREE.Color('#a9c3e8'), low = new THREE.Color('#2a4655'), c = new THREE.Color()
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, y = hs[k], sl = Math.abs(hs[Math.min(NZ - 1, j + 1) * NX + i] - y) + Math.abs(hs[j * NX + Math.min(NX - 1, i + 1)] - y)
    const snowAmt = sstep(2.4, 3.8, y + (vnoise(i * 0.4, j * 0.4) - 0.5) * 1.1) * (1 - sstep(0.18, 0.5, sl) * 0.55)
    c.copy(low).lerp(rock, sstep(-0.3, 1.2, y)).lerp(shade, sstep(0.45, 0.8, sl) * 0.5).lerp(snow, snowAmt).lerp(haze, sstep(0.3, 1.0, j / NZ) * 0.55)       // aerial perspective with depth
    col.set([c.r, c.g, c.b], k * 3)
  }
  const idx: number[] = []; for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i; idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1) }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, fog: false })); root.add(mesh)
  // the rope route up the face, and the climber's light
  const pts: THREE.Vector3[] = []; for (let s = 0; s <= 14; s++) { const t = s / 14, x = 1.6 - 3.8 * t + Math.sin(t * 9) * 0.3, z = -3.1 - 4.2 * t; pts.push(new THREE.Vector3(x, h(x, z) + 0.07, z)) }
  const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, 180, 0.026, 6, false), total = tube.index!.count
  const rope = new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ff8c00', emissiveIntensity: 0.9, roughness: 0.6, fog: false })); rope.frustumCulled = false; root.add(rope); tube.setDrawRange(0, 0)
  const climber = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), led(AM, 4)); root.add(climber); const cl = new THREE.PointLight('#ffb020', 0, 2.2); climber.add(cl)
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), led(CY, 3)); root.add(flag); const end = pts[pts.length - 1]; flag.position.copy(end).add(new THREE.Vector3(0, 0.14, 0))
  // snow in the air
  const N = 240, sp = new Float32Array(N * 3), sv = new Float32Array(N); for (let i = 0; i < N; i++) { sp.set([(Math.random() - 0.5) * 12, Math.random() * 5, -1 - Math.random() * 7], i * 3); sv[i] = 0.25 + Math.random() * 0.5 }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); const flakes = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.045, transparent: true, opacity: 0.85, depthWrite: false, fog: false })); flakes.frustumCulled = false; root.add(flakes)
  const prog = { v: 0 }
  return {
    root,
    show(on: boolean) {
      if (on) { root.visible = true; prog.v = 0; tube.setDrawRange(0, 0); cl.intensity = 0; gsap.fromTo(root.position, { y: (root.userData.y ?? 0) - 1.6 }, { y: root.userData.y ?? 0, duration: 1.8, ease: 'power3.out' }) }
      else { root.visible = false }
    },
    /** the climber works up the rope over `sec` seconds */
    climb(sec: number) { gsap.to(prog, { v: 1, duration: sec, ease: 'power1.inOut' }); gsap.to(cl, { intensity: 2.6, duration: 1 }) },
    layout(portrait: boolean) { const y = portrait ? 0.4 : -0.55; root.userData.y = y; root.position.set(portrait ? 0 : 0.6, y, portrait ? -1.2 : -0.4); root.scale.setScalar(portrait ? 0.62 : 1) },
    update(dt: number, t: number) {
      if (!root.visible) return
      tube.setDrawRange(0, Math.floor(total * prog.v / 3) * 3); const p = curve.getPoint(Math.min(0.9999, prog.v)); climber.position.copy(p); climber.scale.setScalar(1 + 0.15 * Math.sin(t * 6)); flag.rotation.y = t * 1.5; flag.visible = prog.v > 0.97
      const a = sg.attributes.position as THREE.BufferAttribute; for (let i = 0; i < N; i++) { let y = a.getY(i) - sv[i] * dt, x = a.getX(i) + Math.sin(t * 0.6 + i) * dt * 0.1; if (y < -0.5) y = 5; a.setXYZ(i, x, y, a.getZ(i)) } a.needsUpdate = true
    },
  }
}

/* ---------------------------------------------------------------- basketball court */
function courtTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 560; const g = c.getContext('2d')!
  const wood = g.createLinearGradient(0, 0, 0, 560); wood.addColorStop(0, '#c98a4a'); wood.addColorStop(1, '#a8672f'); g.fillStyle = wood; g.fillRect(0, 0, 1024, 560)
  for (let x = 0; x < 1024; x += 26) { g.fillStyle = x % 52 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; g.fillRect(x, 0, 24, 560); g.fillStyle = 'rgba(60,30,10,0.25)'; g.fillRect(x + 24, 0, 2, 560) }
  g.strokeStyle = '#f7f1e6'; g.lineWidth = 8; g.strokeRect(14, 14, 996, 532)
  g.beginPath(); g.moveTo(512, 14); g.lineTo(512, 546); g.stroke(); g.beginPath(); g.arc(512, 280, 70, 0, Math.PI * 2); g.stroke()
  g.fillStyle = 'rgba(0,120,200,0.55)'; g.fillRect(14, 190, 230, 180); g.strokeRect(14, 190, 230, 180); g.beginPath(); g.arc(244, 280, 70, -Math.PI / 2, Math.PI / 2); g.stroke()
  g.fillStyle = 'rgba(0,120,200,0.55)'; g.fillRect(780, 190, 230, 180); g.strokeRect(780, 190, 230, 180); g.beginPath(); g.arc(780, 280, 70, Math.PI / 2, -Math.PI / 2); g.stroke()
  g.beginPath(); g.arc(1010, 280, 230, Math.PI / 2 + 0.35, -Math.PI / 2 - 0.35); g.stroke(); g.beginPath(); g.arc(14, 280, 230, -Math.PI / 2 + 0.35, Math.PI / 2 - 0.35); g.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t
}
function ballTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d')!; g.fillStyle = '#e8741c'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#1a0d05'; g.lineWidth = 4
  for (const x of [0, 64, 128, 192, 256]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke() }
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke(); g.beginPath(); g.ellipse(64, 64, 40, 62, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(192, 64, 40, 62, 0, 0, Math.PI * 2); g.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function createCourt() {
  const root = new THREE.Group(); root.visible = false; const stage_ = new THREE.Group(); root.add(stage_)
  const L = 2.4, Wd = 1.31
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, Wd), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.32, metalness: 0.05 })); floor.position.y = -0.03; stage_.add(floor)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(L + 0.08, 0.012, Wd + 0.08), led(AM, 1.8)); edge.position.y = -0.066; stage_.add(edge)
  // the hoop at the right-hand end: support, glass backboard, orange target box, rim and net
  const hx = L / 2 - 0.12, rimY = 0.62, rimR = 0.11, steel = phys('#8c97aa', { metalness: 0.9, roughness: 0.3, clearcoat: 0.1 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, rimY + 0.4, 12), steel); pole.position.set(hx + 0.12, (rimY + 0.4) / 2, 0); stage_.add(pole)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), steel); arm.position.set(hx + 0.07, rimY + 0.16, 0); stage_.add(arm)
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.5), new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.35, roughness: 0.05, transmission: 0.0, clearcoat: 1 })); board.position.set(hx + 0.01, rimY + 0.12, 0); stage_.add(board)
  for (const [w, hh, y, z] of [[0.012, 0.015, rimY + 0.07, 0], [0.012, 0.015, rimY + 0.17, 0]] as const) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.2), led(AM, 2.2)); b.position.set(hx + 0.03, y, z); stage_.add(b) }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.009, 8, 36), phys('#ff6a00', { metalness: 0.6, roughness: 0.3 })); rim.rotation.x = Math.PI / 2; rim.position.set(hx - rimR - 0.02, rimY, 0); stage_.add(rim)
  const rimC = new THREE.Vector3(hx - rimR - 0.02, rimY, 0)
  // net: 14 strings running down in a taper, plus 4 rings
  const NS = 14, NR = 5, netPos = new Float32Array((NS * (NR - 1) * 2 + NR * NS * 2) * 3), net = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#f5f8ff', transparent: true, opacity: 0.9 })); stage_.add(net)
  const ringPoint = (k: number, i: number, sway: number, out: number[], o: number) => { const a = (i / NS) * Math.PI * 2, f = k / (NR - 1), r = rimR * (1 - 0.35 * f); out[o] = rimC.x + Math.cos(a) * r + sway * f; out[o + 1] = rimC.y - f * 0.2; out[o + 2] = rimC.z + Math.sin(a) * r }
  const tmp: number[] = []; const buildNet = (sway: number) => { let n = 0; const p: number[] = []
    for (let i = 0; i < NS; i++) for (let k = 0; k < NR - 1; k++) { ringPoint(k, i, sway, p, 0); ringPoint(k + 1, i, sway, p, 3); tmp.push(...p.slice(0, 6)); n += 6 }
    for (let k = 1; k < NR; k++) for (let i = 0; i < NS; i++) { ringPoint(k, i, sway, p, 0); ringPoint(k, (i + 1) % NS, sway, p, 3); tmp.push(...p.slice(0, 6)); n += 6 }
    netPos.set(tmp.slice(0, netPos.length)); tmp.length = 0; net.geometry.setAttribute('position', new THREE.BufferAttribute(netPos, 3)); net.geometry.attributes.position.needsUpdate = true }
  buildNet(0)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 18), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.6 })); ball.position.set(-hx + 0.2, 0.08, 0.05); stage_.add(ball)
  const glow = new THREE.PointLight('#ffb020', 0, 3); glow.position.set(0.2, 0.7, 0.3); root.add(glow)
  const home = ball.position.clone(), state = { shown: false, shot: false, sway: 0 }
  stage_.rotation.set(0.55, -0.12, 0)
  return {
    root, onPick: null as null | (() => void), pickables: [stage_],
    show(on: boolean) {
      state.shown = on
      if (on) { state.shot = false; ball.position.copy(home); root.visible = true; gsap.fromTo(root.scale, { x: .001, y: .001, z: .001 }, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'back.out(1.5)' }); gsap.to(glow, { intensity: 2, duration: 1 }) }
      else { gsap.to(root.scale, { x: .001, y: .001, z: .001, duration: 0.5, ease: 'power2.in', onComplete: () => { if (!state.shown) root.visible = false } }); gsap.to(glow, { intensity: 0, duration: 0.4 }) }
    },
    /** a jump shot: an arc into the hoop, a swish of the net, then two bounces on the floor */
    shoot(): Promise<void> {
      if (state.shot || !state.shown) return Promise.resolve(); state.shot = true
      return new Promise((res) => {
        const o = { t: 0 }, x0 = home.x, y0 = home.y, x1 = rimC.x, y1 = rimC.y
        gsap.timeline({ onComplete: res })
          .to(o, { t: 1, duration: 1.25, ease: 'none', onUpdate: () => { const t = o.t; ball.position.x = lerp(x0, x1, t); ball.position.y = lerp(y0, y1, t) + 0.78 * 4 * t * (1 - t) + 0.12 * Math.sin(t * Math.PI) * 0; ball.position.z = lerp(home.z, 0, t); ball.rotation.z -= 0.22; ball.rotation.x += 0.08 } })
          .to(ball.position, { y: 0.075, duration: 0.5, ease: 'power2.in' }, 1.25).to(ball.position, { x: x1 - 0.12, duration: 0.5, ease: 'none' }, 1.25)
          .to(ball.position, { y: 0.26, duration: 0.28, ease: 'power2.out' }, 1.75).to(ball.position, { y: 0.075, duration: 0.28, ease: 'power2.in' }, 2.03).to(ball.position, { x: x1 - 0.3, duration: 0.56, ease: 'none' }, 1.75)
          .to(state, { sway: 1, duration: 0.12, ease: 'power2.out' }, 1.28).to(state, { sway: 0, duration: 0.9, ease: 'elastic.out(1,0.35)' }, 1.4)
          .fromTo(glow, { intensity: 6 }, { intensity: 2, duration: 1 }, 1.3)
      })
    },
    get shot() { return state.shot },
    layout(portrait: boolean) { root.position.set(portrait ? -0.1 : 0.8, portrait ? 2.6 : 1.1, portrait ? -0.2 : 0.2); root.userData.base = root.position.y; stage_.scale.setScalar(portrait ? 0.58 : 0.6) },
    update(_dt: number, t: number) { if (!root.visible) return; root.position.y = root.userData.base + Math.sin(t * 0.9 + 1) * 0.015; buildNet(state.sway * 0.05 * Math.sin(t * 40)) },
  }
}

export function createProps() {
  const chess = createChess(), mountains = createMountains(), court = createCourt()
  const all = [chess, mountains, court]
  const ray = new THREE.Raycaster(), v = new THREE.Vector2()
  return {
    chess, mountains, court, roots: all.map((p) => p.root),
    layout(aspect: number) { for (const p of all) p.layout(aspect < (p === court ? 1.0 : 0.75)) },
    update(dt: number, t: number) { for (const p of all) p.update(dt, t) },
    /** a click or tap at (x, y) in pixels: returns true if it hit an interactive prop (which then reacts) */
    pick(x: number, y: number, camera: THREE.Camera): boolean {
      v.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(v, camera)
      for (const p of [chess, court]) if (p.root.visible && p.onPick && ray.intersectObjects(p.pickables, true).length) { p.onPick(); return true }
      return false
    },
  }
}
