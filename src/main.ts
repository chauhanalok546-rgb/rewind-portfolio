import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Avatar, type Expression } from './avatar/Avatar'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const statusEl = document.getElementById('status')!
const speakBtn = document.getElementById('speak') as HTMLButtonElement
const frameBtn = document.getElementById('frame') as HTMLButtonElement
const blinkBtn = document.getElementById('blink') as HTMLButtonElement
const sub = document.getElementById('sub')!

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()
scene.background = new THREE.Color('#f5f8fc')
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.55
scene.add(new THREE.HemisphereLight('#ffffff', '#cfe3f5', 0.7))
const key = new THREE.DirectionalLight('#ffffff', 2.2)
key.position.set(2, 3, 3); key.castShadow = true; scene.add(key)
const rim = new THREE.DirectionalLight('#00b4ff', 0.8)
rim.position.set(-3, 2, -2); scene.add(rim)

// time-machine platform (placeholder for Phase 3)
const platform = new THREE.Mesh(
  new THREE.CylinderGeometry(0.9, 0.95, 0.06, 64),
  new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.1 }),
)
platform.position.y = -0.03; platform.receiveShadow = true; scene.add(platform)
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(0.88, 0.008, 12, 96),
  new THREE.MeshStandardMaterial({ color: '#00b4ff', emissive: '#00b4ff', emissiveIntensity: 1.5 }),
)
ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring)

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
const avatar = new Avatar()
scene.add(avatar.root)

let closeUp = false
const camPos = new THREE.Vector3(0, 1.0, 5.2)
const camLook = new THREE.Vector3(0, 0.92, 0)
function setFrame() {
  if (closeUp) {
    const h = avatar.headPosition()
    camPos.set(0, h.y + 0.02, 1.35); camLook.set(0, h.y - 0.02, 0)
  } else {
    camPos.set(0, 1.0, 5.2); camLook.set(0, 0.92, 0)
  }
}
const camNow = camPos.clone(); const lookNow = camLook.clone()

function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // keep the full body in view on tall/narrow screens
  camera.fov = w / h < 0.7 ? 38 : 28
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize); resize()

addEventListener('pointermove', (e) => {
  avatar.setLookTarget((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
})

const clock = new THREE.Clock()
let frames = 0, fpsT = 0, fps = 0
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1)
  avatar.update(dt)
  ring.rotation.z += dt * 0.3
  camNow.lerp(camPos, 1 - Math.exp(-4 * dt)); lookNow.lerp(camLook, 1 - Math.exp(-4 * dt))
  camera.position.copy(camNow); camera.lookAt(lookNow)
  renderer.render(scene, camera)
  frames++; fpsT += dt
  if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; if (ready) statusEl.textContent = `ready · ${avatar.morphCount} morph targets · ${fps.toFixed(0)} fps` }
  requestAnimationFrame(tick)
}
let ready = false

avatar.load('/avatar.glb').then(() => {
  ready = true
  statusEl.textContent = `ready · ${avatar.morphCount} morph targets`
  speakBtn.disabled = frameBtn.disabled = blinkBtn.disabled = false
  setFrame()
}).catch((e) => { statusEl.textContent = 'failed to load avatar: ' + e })

const LINE = "Hello, and welcome to my lab. I'm Alok Chauhan, or at least the digital version of him. Thank you for taking the time to visit."
speakBtn.onclick = async () => {
  speakBtn.disabled = true
  sub.textContent = LINE; sub.classList.add('on')
  try {
    await avatar.speak('/audio/test_line.mp3', '/audio/test_line.json', () => { sub.classList.remove('on'); speakBtn.disabled = false })
  } catch (e) {
    statusEl.textContent = 'audio blocked or missing: ' + e
    sub.classList.remove('on'); speakBtn.disabled = false
  }
}
frameBtn.onclick = () => { closeUp = !closeUp; setFrame() }
blinkBtn.onclick = () => avatar.blinkNow()
for (const e of ['neutral', 'happy', 'serious', 'proud'] as Expression[]) {
  document.getElementById('ex-' + e)!.addEventListener('click', () => avatar.setExpression(e))
}

// debug hooks for automated checks
;(window as unknown as Record<string, unknown>).__avatar = avatar
tick()
