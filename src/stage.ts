import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import gsap from 'gsap'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Avatar } from './avatar/Avatar'
import { Narrator } from './voice/Narrator'
import { createRobot } from './robot'
import { createMachine } from './machine'
import { createHovercar } from './hovercar'
import { createEngine } from './engine'
import { createDog } from './dog'

export type Theme = 'cinematic' | 'lab'

/** The 3D stage: lights, time-machine platform, gyroscope rings, motes, camera. The app drives it through `stage`. */
const canvas = document.getElementById('stage') as HTMLCanvasElement
/** weaker devices (touch phones, small screens, few CPU cores) get a lighter scene */
const lowEnd = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 560 || (navigator.hardwareConcurrency ?? 8) <= 4
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, alpha: true, powerPreference: 'high-performance' })
let dprCap = lowEnd ? 1.25 : Math.min(1.5, Math.max(1, Math.sqrt(2.3e6 / (innerWidth * innerHeight))))      // about 2.3 megapixels at most                       // lowered automatically when the frame rate dips
renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.shadowMap.enabled = true
renderer.localClippingEnabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

const scene = new THREE.Scene()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture

const hemi = new THREE.HemisphereLight('#dfeaff', '#0e1726', 0.5); scene.add(hemi)
const key = new THREE.SpotLight('#fff1e0', 20, 14, 0.5, 0.95, 1.6)
key.position.set(1.8, 3.2, 3.4); key.target.position.set(0, 1.0, 0); key.castShadow = !lowEnd
key.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024); key.shadow.bias = -0.0004; key.shadow.radius = 5
scene.add(key, key.target)
const rimC = new THREE.SpotLight('#00b4ff', 26, 12, 0.7, 0.8, 1.6); rimC.position.set(-2.6, 2.4, -2.4); rimC.target.position.set(0, 1.1, 0); scene.add(rimC, rimC.target)
const rimA = new THREE.SpotLight('#ffb020', 18, 12, 0.7, 0.8, 1.6); rimA.position.set(2.6, 2.0, -2.6); rimA.target.position.set(0, 1.1, 0); scene.add(rimA, rimA.target)
const fill = new THREE.DirectionalLight('#cfe3ff', 0.4); fill.position.set(-3, 1.5, 3); scene.add(fill)
const bounce = new THREE.DirectionalLight('#ffb98a', 0.45); bounce.position.set(0.3, -1.2, 2.5); scene.add(bounce)      // warm light bouncing up from the floor: lifts the shadow under the chin and brows

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

const MOTES = lowEnd ? 80 : 220
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
  uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uSpeed: { value: 1 }, uA: { value: new THREE.Color('#00b4ff') }, uB: { value: new THREE.Color('#ffb020') }, uSize: { value: 1 } },
  vertexShader: `uniform float uTime; uniform float uScale; uniform float uSpeed; uniform float uSize; attribute vec2 seed; varying float vA; varying float vC;
    void main(){ vec3 p=position; p.y=mod(p.y+uTime*uSpeed*(0.05+seed.x*0.12),3.2); p.x+=sin(uTime*0.3+seed.y*6.28)*0.12; p.z+=cos(uTime*0.27+seed.x*6.28)*0.12;
      vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(1.5+seed.y*3.0)*uSize*uScale*(3.0/-mv.z);
      vA=smoothstep(0.0,0.4,p.y)*(1.0-smoothstep(2.4,3.2,p.y))*(0.35+0.65*seed.x); vC=seed.y; }`,
  fragmentShader: `uniform vec3 uA; uniform vec3 uB; varying float vA; varying float vC; void main(){ vec2 d=gl_PointCoord-0.5; float a=smoothstep(0.5,0.0,length(d)); vec3 col=mix(uA,uB,step(0.8,vC))*2.0; gl_FragColor=vec4(col,a*vA); }`,
})
const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; scene.add(motes)

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60)
const avatar = new Avatar()
avatar.hairPhysics = !lowEnd
scene.add(avatar.root)
const narrator = new Narrator(avatar)

// ARM-01, the robotic arm: stands beside the avatar in the lobby and on the end card
const robot = createRobot()
robot.root.position.set(1.1, 0.42, 0.2); robot.root.rotation.y = -2.5; robot.root.scale.setScalar(0.9)
scene.add(robot.root)
// BUILDER-01, the machine that powers up on the end card
const machine = createMachine()
machine.root.position.set(-1.2, 0.42, 0.1); machine.root.rotation.y = 0.5
scene.add(machine.root)
// RINGO, the robot dog: Alok's partner in time travel, always at his side
const dog = createDog()
scene.add(dog.root)
let dogSide = -0.78, dogDepth = 0.06
// the Chrono Engine: a large machine at the back of the lab
const engine = createEngine()
engine.root.position.set(0.1, -0.2, -5.4); engine.root.scale.setScalar(0.9)
scene.add(engine.root)
// hover-cars cruising through the background (silent: just the flight)
const hovercar = createHovercar()
hovercar.setEnabled(!reducedMotion)
scene.add(hovercar.root)

/** Knobs the app turns: ring speed, glow flare (snap), chronometer glow, mote speed. */
export const fx = { ringSpeed: 1, flare: 0, chrono: 0, motes: 1, warp: 0 }
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
  pool.visible = dark; motes.visible = dark && !reducedMotion
  glowOpacity = dark ? 1 : 0.45
  document.documentElement.dataset.theme = t
}
export const getTheme = () => theme
setTheme('cinematic')

// ---- lobby objects can be hidden while the film plays
const lobbyObjects: THREE.Object3D[] = [platform, edge, pool, ...rings, robot.root, engine.root]
export function setLobbyVisible(v: boolean, ms = 0) {
  const apply = (o: THREE.Object3D, on: boolean) => { o.visible = on }
  if (ms <= 0) { lobbyObjects.forEach((o) => apply(o, v)); return }
  if (v) lobbyObjects.forEach((o) => { o.visible = true; o.scale.setScalar(0.001); gsap.to(o.scale, { x: 1, y: 1, z: 1, duration: ms / 1000, ease: 'power3.out' }) })
  else lobbyObjects.forEach((o) => { gsap.to(o.scale, { x: 0.001, y: 0.001, z: 0.001, duration: ms / 1000, ease: 'power3.in', onComplete: () => { o.visible = false; o.scale.setScalar(1) } }) })
}
/** 3D atmosphere per era: colour, drift speed (negative falls), size of the particles */
const AMBIENCE: Record<string, { a: string; b: string; speed: number; size: number }> = {
  lobby: { a: '#00b4ff', b: '#ffb020', speed: 1, size: 1 },
  scene1: { a: '#ffe2a8', b: '#fff6dc', speed: 0.6, size: 1.2 },       // warm morning dust over Uttarkashi
  scene2: { a: '#fff0c8', b: '#9fc2ff', speed: 0.5, size: 1.0 },       // dust in the hall's spotlight
  scene3: { a: '#ffb020', b: '#ff7a3c', speed: 1.8, size: 1.1 },       // embers of the dusk city
  scene4: { a: '#00b4ff', b: '#baf0ff', speed: -3.5, size: 0.9 },      // code falling at NST
  scene5: { a: '#ffffff', b: '#9fdcff', speed: 0.25, size: 1.4 },      // slow stars of 2030
}
export function setAmbience(kind: string) {
  const a = AMBIENCE[kind] ?? AMBIENCE.lobby
  motes.visible = theme === 'cinematic' && !reducedMotion
  gsap.to(moteMat.uniforms.uA.value, { r: new THREE.Color(a.a).r, g: new THREE.Color(a.a).g, b: new THREE.Color(a.a).b, duration: 1.2 })
  gsap.to(moteMat.uniforms.uB.value, { r: new THREE.Color(a.b).r, g: new THREE.Color(a.b).g, b: new THREE.Color(a.b).b, duration: 1.2 })
  gsap.to(fx, { motes: a.speed, duration: 1.2 }); gsap.to(moteMat.uniforms.uSize, { value: a.size, duration: 1.2 })
}
export function setAvatarPose(x: number, yaw: number, ms: number) {
  avatar.stopWalk(); avatar.root.position.z = 0; avatar.root.position.y = 0
  dogSide = x === 0 ? -0.78 : -0.62; dogDepth = x === 0 ? 0.06 : 0.1; dog.root.scale.setScalar(x === 0 ? 1 : 1.1)
  if (ms <= 0) { avatar.root.position.x = x; avatar.root.rotation.y = yaw; return }
  gsap.to(avatar.root.position, { x, duration: ms / 1000, ease: 'power3.inOut' })
  gsap.to(avatar.root.rotation, { y: yaw, duration: ms / 1000, ease: 'power3.inOut' })
}

// ---- teleport: dissolve into cyan and amber light (feet up), reassemble head down; a sweeping clip plane + a particle burst
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1)
const dogClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1)       // the dog is about a quarter of Alok's height, so his sweep is scaled to match
function setClip(c: number) { clipPlane.constant = c; dogClip.constant = c > 3 ? c : c * 0.28 }       // visible where y > c (constant = -c)
const tp = { c: -1, active: false, side: 0 }
const P = 520
const pPos = new Float32Array(P * 3), pVel = new Float32Array(P * 3), pLife = new Float32Array(P), pCol = new Float32Array(P * 3)
const pGeo = new THREE.BufferGeometry()
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
const pPoints = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true }))
pPoints.frustumCulled = false; scene.add(pPoints)
let pCursor = 0
function emitParticles(n: number) {
  for (let k = 0; k < n; k++) {
    const i = pCursor++ % P, amber = Math.random() < 0.35
    pPos[i * 3] = avatar.root.position.x + (Math.random() - 0.5) * 0.7; pPos[i * 3 + 1] = tp.c + (Math.random() - 0.5) * 0.08; pPos[i * 3 + 2] = (Math.random() - 0.5) * 0.35
    pVel[i * 3] = (Math.random() - 0.5) * 0.5; pVel[i * 3 + 1] = 0.25 + Math.random() * 0.9; pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.5
    pLife[i] = 0.7 + Math.random() * 0.7
    const c = amber ? [1.0, 0.69, 0.13] : [0.0, 0.71, 1.0]; pCol[i * 3] = c[0] * 2; pCol[i * 3 + 1] = c[1] * 2; pCol[i * 3 + 2] = c[2] * 2
  }
}
function stepParticles(dt: number) {
  if (tp.active) emitParticles(Math.max(1, Math.round(dt * 900)))
  for (let i = 0; i < P; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -50; continue }
    pLife[i] -= dt
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt
    const f = Math.max(0, pLife[i]); pCol[i * 3] *= 0.99 * f > 0.3 ? 1 : 0.9; pCol[i * 3 + 1] *= f > 0.3 ? 1 : 0.9; pCol[i * 3 + 2] *= f > 0.3 ? 1 : 0.9
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true
}
for (let i = 0; i < P; i++) pPos[i * 3 + 1] = -50
let clipApplied = false
function applyClip() {
  if (clipApplied) return; clipApplied = true
  avatar.root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (!m) return; for (const x of ([] as THREE.Material[]).concat(m)) { x.clippingPlanes = [clipPlane]; x.clipShadows = true } })
  dog.root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (!m) return; for (const x of ([] as THREE.Material[]).concat(m)) { x.clippingPlanes = [dogClip]; x.clipShadows = true } })
}
/** 'out': dissolve from the feet up (then hidden). 'in': reassemble from the head down. */
export function teleport(dir: 'out' | 'in', ms = 1200): Promise<void> {
  applyClip(); avatar.root.visible = true
  const from = dir === 'out' ? -0.05 : 2.0, to = dir === 'out' ? 2.0 : -0.1
  tp.c = from; setClip(-tp.c); tp.active = true
  return new Promise((resolve) => {
    gsap.to(tp, { c: to, duration: ms / 1000, ease: dir === 'out' ? 'power2.in' : 'power2.out', onUpdate: () => { setClip(-tp.c) }, onComplete: () => {
      tp.active = false
      if (dir === 'out') avatar.root.visible = false; else setClip(5)
      resolve()
    } })
  })
}
export function setAvatarVisible(v: boolean) { applyClip(); avatar.root.visible = v; setClip(v ? 5 : -5) }

let closeUp = false
let userZoom = 1, baseFov = 28
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
/** manual zoom-out for small windows: 1 = fit, up to 1.45 = pulled well back */
export function setZoom(z: number) { userZoom = z; resize() }
export const getZoom = () => userZoom

// ---- cinematic finish: bloom around everything that glows and a gentle colour grade. If the machine cannot hold the frame rate it switches itself off.
const gradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.1 }, uShadow: { value: new THREE.Color(0.0, 0.015, 0.05) }, uHigh: { value: new THREE.Color(0.05, 0.025, 0.0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat; uniform vec3 uShadow; uniform vec3 uHigh; varying vec2 vUv;
    void main(){ vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);                                   // a touch more colour
      c += mix(uShadow, uHigh, smoothstep(0.05, 0.8, l)) * min(1.0, t.a * 4.0);   // cool shadows, warm highlights
      float a = max(t.a, max(c.r, max(c.g, c.b)));                  // glow outside the models stays visible on the transparent canvas
      gl_FragColor = vec4(c, min(a, 1.0)); }`,
}
let composer: EffectComposer | null = null, bloom: UnrealBloomPass | null = null
let cinematic = !lowEnd && !reducedMotion && !/[?&]fx=off/.test(location.search), lowFpsSeconds = 0
function initComposer() {
  if (composer || !cinematic) return
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.55, 0.92); composer.addPass(bloom)
  composer.addPass(new ShaderPass(gradeShader)); composer.addPass(new OutputPass())
  composer.setPixelRatio(Math.min(devicePixelRatio, dprCap)); composer.setSize(innerWidth, innerHeight)
}
export function setCinematic(on: boolean) { cinematic = on; lowFpsSeconds = 0; if (on) initComposer() }
export const isCinematic = () => cinematic && !!composer

function resize() {
  const w = innerWidth, h = innerHeight
  const dpr = Math.min(devicePixelRatio, dprCap)
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false)
  if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h) }
  camera.aspect = w / h
  // fit the whole set: the sides of the scene (dog, arm, machines) span about +/-2 world units, so pull back and widen the lens for narrower windows
  const a = w / h, SPAN = 2.05
  if (a >= 1.6) { camera.fov = 28; camBase.set(0, 1.05, 4.4); lookBase.set(0, 0.95, 0) }
  else {
    camera.fov = a < 0.7 ? 46 : a < 1.2 ? 40 : 34
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    camBase.set(0, a < 1 ? 1.3 : 1.15, Math.max(4.4, SPAN / (th * a))); lookBase.set(0, a < 1 ? 1.35 : 1.05, 0)
  }
  baseFov = camera.fov
  camBase.z *= userZoom; camBase.y *= 0.5 + 0.5 * userZoom; lookBase.y *= 0.5 + 0.5 * userZoom
  if (w / h < 0.75) { robot.root.position.set(0.78, 1.0, -0.3); robot.root.scale.setScalar(0.4); machine.root.position.set(-0.8, 0.95, -0.3); machine.root.userData.s = 0.4; engine.root.position.set(0, 0.7, -6.5); engine.root.scale.setScalar(0.9) } else { robot.root.position.set(1.1, 0.42, 0.2); robot.root.scale.setScalar(0.9); machine.root.position.set(-1.2, 0.42, 0.1); machine.root.userData.s = 0.9; engine.root.position.set(0.1, -0.2, -5.4); engine.root.scale.setScalar(0.9) }   // portrait: the arm floats higher and smaller so the control bar does not hide it
  if (!closeUp) { camPos.copy(camBase); camLook.copy(lookBase) }
  camera.updateProjectionMatrix()
  moteMat.uniforms.uScale.value = (h * dpr) / 900
}
addEventListener('resize', resize); resize()
addEventListener('pointermove', (e) => {
  const nx = (e.clientX / innerWidth) * 2 - 1, ny = -((e.clientY / innerHeight) * 2 - 1)
  avatar.setLookTarget(nx, ny); pointer.set(nx, ny)
})

const log_fx = (m: string) => console.info('[fx]', m)
let warped = false
let prevT = performance.now()
let elapsed = 0
let frames = 0, fpsT = 0
export const perf = { fps: 60, dpr: 1, calls: 0, tris: 0, shadows: 0 }
let running = true
function tick() {
  const now = performance.now(); const dt = Math.min((now - prevT) / 1000, 0.05); prevT = now; elapsed += dt
  const t = elapsed
  avatar.update(dt)
  dog.update(dt, t, { x: avatar.root.position.x, z: avatar.root.position.z, yaw: avatar.root.rotation.y, visible: avatar.root.visible && !closeUp, speaking: avatar.isSpeaking(), side: dogSide, depth: dogDepth })
  robot.update(dt)
  machine.update(dt, t)
  engine.update(dt, t)
  hovercar.update(dt)
  stepParticles(dt)
  for (const r of rings) { r.rotation.z += dt * r.userData.speed * fx.ringSpeed * (reducedMotion ? 0.35 : 1) * (r.userData.axis % 2 ? -1 : 1); r.position.y = r.userData.baseY + Math.sin(t * 0.5 + r.userData.axis) * 0.03 }
  moteMat.uniforms.uTime.value = t; moteMat.uniforms.uSpeed.value = fx.motes
  for (const h of halos) (h.material as THREE.MeshBasicMaterial).opacity = Math.min(1, h.userData.base * (glowOpacity + fx.flare * 2.5) * (0.85 + 0.15 * Math.sin(t * 1.3)))
  for (const m of chronoMats) m.emissiveIntensity = 1 + fx.chrono * 6
  pointerNow.lerp(pointer, 1 - Math.exp(-2.5 * dt))
  const k = 1 - Math.exp(-3.2 * dt)
  camNow.lerp(camPos, k); lookNow.lerp(camLook, k)
  const par = closeUp ? 0.05 : 0.22
  const drift = reducedMotion ? 0 : 1
  camera.position.set(camNow.x + pointerNow.x * par * drift + Math.sin(t * 0.17) * 0.05 * drift, camNow.y + pointerNow.y * par * 0.4 * drift + Math.sin(t * 0.23) * 0.025 * drift, camNow.z + Math.sin(t * 0.13) * 0.06 * drift)
  if (fx.warp > 0.001) {                                           // time-warp: the lens stretches and the camera shakes
    const sh = fx.warp * 0.05
    camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh
    camera.fov = baseFov + fx.warp * 22; camera.updateProjectionMatrix(); warped = true
  } else if (warped) { camera.fov = baseFov; camera.updateProjectionMatrix(); warped = false }
  camera.lookAt(lookNow)
  if (cinematic) { initComposer(); if (bloom) bloom.strength = theme === 'lab' ? 0.12 : 0.42 }
  if (cinematic && composer) composer.render(dt); else renderer.render(scene, camera)
  perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles
  frames++; fpsT += dt
  if (fpsT >= 1) {
    perf.fps = frames / fpsT; frames = 0; fpsT = 0; perf.dpr = Math.min(devicePixelRatio, dprCap)
    if (cinematic && composer && perf.fps < 46) { if (++lowFpsSeconds >= 3) { cinematic = false; log_fx('glow off: frame rate'); } } else lowFpsSeconds = 0
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
  // warm-up: switch the dissolve's clipping on now (it recompiles every avatar shader, a 150 ms hitch the first time he teleports) and compile
  // everything that appears later (machine, hover-car, particles) while the loading screen is still up
  applyClip(); setClip(5)
  const hidden = [machine.root, hovercar.root, engine.root, robot.root, dog.root].filter((o) => !o.visible)
  hidden.forEach((o) => { o.visible = true })
  try { renderer.compile(scene, camera) } catch { /* the first real frame will compile instead */ }
  hidden.forEach((o) => { o.visible = false })
}
tick()

export const stage = { setCinematic, isCinematic, setZoom, getZoom, avatar, narrator, dog, robot, machine, hovercar, fx, setTheme, getTheme, setCloseUp, isCloseUp, perf, setLobbyVisible, setAmbience, setAvatarPose, teleport, setAvatarVisible }
;(window as unknown as Record<string, unknown>).__stage = stage
;(window as unknown as Record<string, unknown>).__avatar = avatar
;(window as unknown as Record<string, unknown>).__narrator = narrator
