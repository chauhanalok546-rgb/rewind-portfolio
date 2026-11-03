import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Avatar } from './avatar/Avatar'
import { Narrator } from './voice/Narrator'

export type Theme = 'cinematic' | 'lab'

/** The 3D stage: lights, time-machine platform, gyroscope rings, motes, camera. The app drives it through `stage`. */
const canvas = document.getElementById('stage') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
let dprCap = 1.5                       // lowered automatically when the frame rate dips
renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture

const hemi = new THREE.HemisphereLight('#dfeaff', '#0e1726', 0.5); scene.add(hemi)
const key = new THREE.SpotLight('#fff4e6', 20, 14, 0.5, 0.6, 1.6)
key.position.set(1.8, 3.2, 3.4); key.target.position.set(0, 1.0, 0); key.castShadow = true
key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.radius = 5
scene.add(key, key.target)
const rimC = new THREE.SpotLight('#00b4ff', 26, 12, 0.7, 0.8, 1.6); rimC.position.set(-2.6, 2.4, -2.4); rimC.target.position.set(0, 1.1, 0); scene.add(rimC, rimC.target)
const rimA = new THREE.SpotLight('#ffb020', 18, 12, 0.7, 0.8, 1.6); rimA.position.set(2.6, 2.0, -2.6); rimA.target.position.set(0, 1.1, 0); scene.add(rimA, rimA.target)
const fill = new THREE.DirectionalLight('#cfe3ff', 0.35); fill.position.set(-3, 1.5, 3); scene.add(fill)

const platMat = new THREE.MeshStandardMaterial({ color: '#10192b', roughness: 0.22, metalness: 0.75 })
const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.06, 0.07, 96), platMat)
platform.position.y = -0.035; platform.receiveShadow = true; scene.add(platform)
const edge = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.010, 12, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color('#00b4ff').multiplyScalar(2.6), toneMapped: false }))
edge.rotation.x = Math.PI / 2; edge.position.y = 0.004; scene.add(edge)
const halos: THREE.Mesh[] = []
function halo(parent: THREE.Object3D, radius: number, color: string, tube: number, opacity: number) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 160), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  m.userData.base = opacity; parent.add(m); halos.push(m)
}
halo(edge, 1.0, '#00b4ff', 0.05, 0.16); halo(edge, 1.0, '#00b4ff', 0.016, 0.35)
const rings: THREE.Mesh[] = []
const RING_DEFS: Array<[number, number, number, string]> = [[1.12, 0.0, 0.0, '#00b4ff'], [1.22, 0.9, 0.4, '#00b4ff'], [1.32, -0.7, 1.1, '#ffb020']]
RING_DEFS.forEach(([r, rx, rz, col], i) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 8, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.55 }))
  m.userData.baseY = i === 0 ? 0.22 : 1.0; m.position.y = m.userData.baseY; m.rotation.set(Math.PI / 2 + rx, 0, rz)
  m.userData.speed = 0.18 + i * 0.07; m.userData.axis = i; rings.push(m); scene.add(m)
  halo(m, r, col, 0.03, 0.10)
})
function radialTexture(inner: string, outer: string) {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, inner); g.addColorStop(1, outer)
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,180,255,0.35)', 'rgba(0,180,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
pool.rotation.x = -Math.PI / 2; pool.position.y = -0.075; scene.add(pool)

const MOTES = 220
const mp = new Float32Array(MOTES * 3), mseed = new Float32Array(MOTES * 2)
for (let i = 0; i < MOTES; i++) {
  const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 2.6
  mp[i * 3] = Math.cos(a) * r; mp[i * 3 + 1] = Math.random() * 3; mp[i * 3 + 2] = Math.sin(a) * r - 0.5
  mseed[i * 2] = Math.random(); mseed[i * 2 + 1] = Math.random()
}
const moteGeo = new THREE.BufferGeometry()
moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3)); moteGeo.setAttribute('seed', new THREE.BufferAttribute(mseed, 2))
const moteMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uSpeed: { value: 1 } },
  vertexShader: `uniform float uTime; uniform float uScale; uniform float uSpeed; attribute vec2 seed; varying float vA; varying float vC;
    void main(){ vec3 p=position; p.y=mod(p.y+uTime*uSpeed*(0.05+seed.x*0.12),3.2); p.x+=sin(uTime*0.3+seed.y*6.28)*0.12; p.z+=cos(uTime*0.27+seed.x*6.28)*0.12;
      vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(1.5+seed.y*3.0)*uScale*(3.0/-mv.z);
      vA=smoothstep(0.0,0.4,p.y)*(1.0-smoothstep(2.4,3.2,p.y))*(0.35+0.65*seed.x); vC=seed.y; }`,
  fragmentShader: `varying float vA; varying float vC; void main(){ vec2 d=gl_PointCoord-0.5; float a=smoothstep(0.5,0.0,length(d)); vec3 col=mix(vec3(0.0,0.71,1.0),vec3(1.0,0.69,0.13),step(0.8,vC)); gl_FragColor=vec4(col,a*vA); }`,
})
const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; scene.add(motes)

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60)
const avatar = new Avatar()
scene.add(avatar.root)
const narrator = new Narrator(avatar)

/** Knobs the app turns: ring speed, glow flare (snap), chronometer glow, mote speed. */
export const fx = { ringSpeed: 1, flare: 0, chrono: 0, motes: 1 }
const chronoMats: THREE.MeshStandardMaterial[] = []
let glowOpacity = 1
let theme: Theme = 'cinematic'
export function setTheme(t: Theme) {
  theme = t
  const dark = t === 'cinematic'
  scene.fog = new THREE.Fog(dark ? '#060a13' : '#f5f8fc', 7, dark ? 16 : 22)
  scene.environmentIntensity = dark ? 0.32 : 0.6
  hemi.intensity = dark ? 0.25 : 0.8
  rimC.intensity = dark ? 26 : 10; rimA.intensity = dark ? 18 : 7; key.intensity = dark ? 20 : 16
  platMat.color.set(dark ? '#10192b' : '#e9eef6'); platMat.metalness = dark ? 0.75 : 0.25
  pool.visible = dark; motes.visible = dark
  glowOpacity = dark ? 1 : 0.45
  document.documentElement.dataset.theme = t
}
export const getTheme = () => theme
setTheme('cinematic')

let closeUp = false
const camBase = new THREE.Vector3(0, 1.05, 4.4), lookBase = new THREE.Vector3(0, 0.95, 0)
const camPos = camBase.clone(), camLook = lookBase.clone()
const camNow = camPos.clone(), lookNow = camLook.clone()
const pointer = new THREE.Vector2(), pointerNow = new THREE.Vector2()
export function setCloseUp(v: boolean) {
  closeUp = v
  if (v) { const h = avatar.headPosition(); camPos.set(0, h.y + 0.02, 1.45); camLook.set(0, h.y - 0.03, 0) }
  else { camPos.copy(camBase); camLook.copy(lookBase) }
}
export const isCloseUp = () => closeUp

function resize() {
  const w = innerWidth, h = innerHeight
  const dpr = Math.min(devicePixelRatio, dprCap)
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.fov = w / h < 0.7 ? 38 : 28
  camera.updateProjectionMatrix()
  moteMat.uniforms.uScale.value = (h * dpr) / 900
}
addEventListener('resize', resize); resize()
addEventListener('pointermove', (e) => {
  const nx = (e.clientX / innerWidth) * 2 - 1, ny = -((e.clientY / innerHeight) * 2 - 1)
  avatar.setLookTarget(nx, ny); pointer.set(nx, ny)
})

const clock = new THREE.Clock()
let frames = 0, fpsT = 0
export const perf = { fps: 60, dpr: 1 }
let running = true
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05)
  const t = clock.elapsedTime
  avatar.update(dt)
  for (const r of rings) { r.rotation.z += dt * r.userData.speed * fx.ringSpeed * (r.userData.axis % 2 ? -1 : 1); r.position.y = r.userData.baseY + Math.sin(t * 0.5 + r.userData.axis) * 0.03 }
  moteMat.uniforms.uTime.value = t; moteMat.uniforms.uSpeed.value = fx.motes
  for (const h of halos) (h.material as THREE.MeshBasicMaterial).opacity = Math.min(1, h.userData.base * (glowOpacity + fx.flare * 2.5) * (0.85 + 0.15 * Math.sin(t * 1.3)))
  for (const m of chronoMats) m.emissiveIntensity = 1 + fx.chrono * 6
  pointerNow.lerp(pointer, 1 - Math.exp(-2.5 * dt))
  const k = 1 - Math.exp(-3.2 * dt)
  camNow.lerp(camPos, k); lookNow.lerp(camLook, k)
  const par = closeUp ? 0.05 : 0.22
  camera.position.set(camNow.x + pointerNow.x * par + Math.sin(t * 0.17) * 0.05, camNow.y + pointerNow.y * par * 0.4 + Math.sin(t * 0.23) * 0.025, camNow.z + Math.sin(t * 0.13) * 0.06)
  camera.lookAt(lookNow)
  renderer.render(scene, camera)
  frames++; fpsT += dt
  if (fpsT >= 1) {
    perf.fps = frames / fpsT; frames = 0; fpsT = 0; perf.dpr = Math.min(devicePixelRatio, dprCap)
    if (perf.fps < 42 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); resize() }   // adaptive resolution
  }
  if (running) requestAnimationFrame(tick)
}

/** Loads the avatar and the narration script; reports download progress for the boot screen. */
export async function loadStage(onProgress: (f: number) => void) {
  await Promise.all([avatar.load('/avatar.glb', onProgress), narrator.load()])
  avatar.root.traverse((o) => {
    if (o.name === 'ChronoDisplay') { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m && 'emissiveIntensity' in m) chronoMats.push(m) }
  })
  setCloseUp(false)
}
tick()

export const stage = { avatar, narrator, fx, setTheme, getTheme, setCloseUp, isCloseUp, perf }
;(window as unknown as Record<string, unknown>).__stage = stage
;(window as unknown as Record<string, unknown>).__avatar = avatar
;(window as unknown as Record<string, unknown>).__narrator = narrator
