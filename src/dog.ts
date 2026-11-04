import * as THREE from 'three'
import { mergeStatic } from './mergeStatic'

/** RINGO: a robot dog and Alok's partner in time travel. A capsule body with LED eyes, antenna ears, a wagging tail, a name tag, and four
 *  two-segment legs on a trot cycle. He follows the avatar around, trots when he has to catch up, tilts his head when Alok talks and barks on cue. */
const graphite = new THREE.MeshStandardMaterial({ color: '#141c2c', metalness: 0.75, roughness: 0.35 })
const white = new THREE.MeshStandardMaterial({ color: '#e6edf8', metalness: 0.6, roughness: 0.28 })
const amber = new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ff9a00', emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.35 })
const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color('#00b4ff').multiplyScalar(3), toneMapped: false })
const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe0ff').multiplyScalar(3), toneMapped: false })
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D) => { const o = new THREE.Mesh(g, m); o.castShadow = false; p.add(o); return o }

function tagTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ffb020'; g.beginPath(); g.roundRect(4, 4, 248, 120, 22); g.fill()
  g.fillStyle = '#0e1726'; g.font = '800 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RINGO', 128, 70)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c)
}

export interface DogCtx { x: number; z: number; yaw: number; visible: boolean; speaking: boolean; side: number; depth: number }

export function createDog() {
  const root = new THREE.Group(); root.visible = false
  const model = new THREE.Group(); root.add(model)                       // faces +z
  const TORSO_Y = 0.37
  const body = new THREE.Group(); body.position.y = TORSO_Y; model.add(body)
  const torso = mesh(new THREE.CapsuleGeometry(0.1, 0.36, 8, 20), white, body); torso.rotation.x = Math.PI / 2; torso.scale.set(1.25, 1, 0.95)
  mesh(new THREE.BoxGeometry(0.2, 0.05, 0.4), graphite, body).position.set(0, -0.085, 0)               // belly plate
  mesh(new THREE.BoxGeometry(0.05, 0.012, 0.42), amber, body).position.set(0, 0.098, -0.02)             // back stripe
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.008, 0.02, 0.34), cyan, body).position.set(s * 0.126, 0.0, -0.01)  // side LED strips
  mesh(new THREE.TorusGeometry(0.075, 0.008, 8, 28), cyan, body).position.set(0, 0.0, 0.265)             // chest ring
  // neck, collar and the name tag
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 16), graphite, body); neck.position.set(0, 0.1, 0.27); neck.rotation.x = -0.45
  const collar = mesh(new THREE.TorusGeometry(0.058, 0.01, 8, 24), amber, body); collar.position.set(0, 0.075, 0.285); collar.rotation.x = Math.PI / 2 - 0.45
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ map: tagTexture(), transparent: true, toneMapped: false, side: THREE.DoubleSide })); tag.position.set(0, 0.015, 0.335); tag.rotation.x = 0.2; body.add(tag)
  // head
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.34); body.add(head)
  const skull = mesh(new THREE.SphereGeometry(0.1, 24, 16), white, head); skull.scale.set(1.0, 0.85, 1.05)
  mesh(new THREE.BoxGeometry(0.1, 0.075, 0.1), graphite, head).position.set(0, -0.025, 0.095)                  // snout
  mesh(new THREE.SphereGeometry(0.02, 12, 8), cyan, head).position.set(0, -0.005, 0.15)                         // nose
  const visor = mesh(new THREE.BoxGeometry(0.17, 0.05, 0.05), graphite, head); visor.position.set(0, 0.03, 0.07)
  const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), eyeMat); e.position.set(s * 0.05, 0.033, 0.097); head.add(e); return e })
  const ears = [-1, 1].map((s) => { const g = new THREE.Group(); g.position.set(s * 0.075, 0.08, -0.01); head.add(g)
    const c = mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.12, 10), graphite, g); c.position.y = 0.06
    mesh(new THREE.SphereGeometry(0.015, 10, 8), amber, g).position.y = 0.125
    g.rotation.z = -s * 0.3; return g })
  // tail
  const tail = new THREE.Group(); tail.position.set(0, 0.06, -0.3); body.add(tail)
  const rod = mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.22, 10), graphite, tail); rod.position.y = 0.11; rod.rotation.x = 0
  mesh(new THREE.SphereGeometry(0.02, 12, 8), cyan, tail).position.y = 0.23
  tail.rotation.x = -0.9
  // legs: hip -> upper -> knee -> lower -> foot
  const L1 = 0.19, L2 = 0.19
  const legs = ([[-0.13, 0.2], [0.13, 0.2], [-0.13, -0.2], [0.13, -0.2]] as const).map(([x, z], i) => {
    const hip = new THREE.Group(); hip.position.set(x, -0.04, z); body.add(hip)
    mesh(new THREE.SphereGeometry(0.048, 14, 10), graphite, hip)
    mesh(new THREE.CylinderGeometry(0.03, 0.026, L1, 12), white, hip).position.y = -L1 / 2
    const knee = new THREE.Group(); knee.position.y = -L1; hip.add(knee)
    mesh(new THREE.SphereGeometry(0.036, 12, 10), amber, knee)
    mesh(new THREE.CylinderGeometry(0.024, 0.02, L2, 12), graphite, knee).position.y = -L2 / 2
    mesh(new THREE.SphereGeometry(0.034, 12, 10), graphite, knee).position.y = -L2
    return { hip, knee, front: z > 0, phase: (i === 0 || i === 3) ? 0 : Math.PI }
  })
  // fewer draw calls: the rigid pieces of each part are baked together (legs, tail, head and body keep moving as wholes)
  for (const l of legs) { mergeStatic(l.knee); mergeStatic(l.hip, [l.knee]) }
  mergeStatic(tail); mergeStatic(head, [...eyes, ...ears]); mergeStatic(body, [head, tail, ...legs.map((l) => l.hip)])
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.004; root.add(blob)

  // state
  let ph = 0, gait = 0, bark = 0, alert = 0, init = false, heading = 0, glance = 0, glanceT = 3, blinkT = 2, speed = 0
  const target = new THREE.Vector3()
  return {
    root, materials: [graphite, white, amber, cyan, eyeMat],
    bark() { bark = 0.5 },
    alert() { alert = 1 },
    update(dt: number, t: number, c: DogCtx) {
      root.visible = c.visible
      if (!c.visible) { init = false; return }
      const ox = c.side * Math.cos(c.yaw) + c.depth * Math.sin(c.yaw), oz = -c.side * Math.sin(c.yaw) + c.depth * Math.cos(c.yaw)
      target.set(c.x + ox, 0, c.z + oz)
      if (!init) { root.position.copy(target); heading = c.yaw; init = true }
      const dx = target.x - root.position.x, dz = target.z - root.position.z, dist = Math.hypot(dx, dz)
      const moving = dist > 0.07
      speed += (((moving ? Math.min(1.4, 0.35 + dist * 2.2) : 0) - speed) * (1 - Math.exp(-8 * dt)))
      if (moving) { const st = Math.min(dist, speed * dt); root.position.x += (dx / dist) * st; root.position.z += (dz / dist) * st }
      const want = moving ? Math.atan2(dx, dz) : c.yaw
      let d = want - heading; d = Math.atan2(Math.sin(d), Math.cos(d)); heading += d * (1 - Math.exp(-7 * dt))
      root.rotation.y = heading
      gait += ((moving ? 1 : 0) - gait) * (1 - Math.exp(-8 * dt)); ph += dt * (4 + speed * 5.5)
      // legs on a trot: diagonal pairs swing together; the knee folds as the foot comes forward
      for (const l of legs) {
        const s = Math.sin(ph + l.phase), lift = Math.max(0, Math.cos(ph + l.phase))
        l.hip.rotation.x = (l.front ? 0.28 : 0.42) + s * 0.55 * gait
        l.knee.rotation.x = (l.front ? -0.62 : -0.7) - lift * 0.8 * gait
      }
      body.position.y = TORSO_Y + Math.abs(Math.sin(ph)) * 0.022 * gait + Math.sin(t * 1.7) * 0.004 + (bark > 0 ? Math.abs(Math.sin((bark / 0.5) * Math.PI * 2)) * 0.05 : 0)
      body.rotation.z = Math.sin(ph) * 0.05 * gait
      body.rotation.x = Math.sin(ph * 2) * 0.03 * gait
      // head: tilts toward Alok when he talks, glances around when idle, snaps up for a bark
      bark = Math.max(0, bark - dt); alert = Math.max(0, alert - dt * 1.5)
      glanceT -= dt; if (glanceT <= 0) { glanceT = 2.5 + Math.random() * 3.5; glance = (Math.random() - 0.5) * 0.9 }
      const toward = -Math.sign(c.side) * 0.55
      const yawT = c.speaking ? toward : glance
      head.rotation.y += (yawT - head.rotation.y) * (1 - Math.exp(-5 * dt))
      const barkK = bark > 0 ? Math.abs(Math.sin((bark / 0.5) * Math.PI * 2)) : 0
      head.rotation.x = -0.1 - barkK * 0.4 - alert * 0.15 + Math.sin(t * 1.3) * 0.03
      head.rotation.z = (c.speaking ? 0.2 * -Math.sign(c.side) : Math.sin(t * 0.6) * 0.07)
      for (let i = 0; i < 2; i++) ears[i].rotation.x = Math.sin(t * 2.2 + i) * 0.04 + alert * 0.35
      const wag = c.speaking || bark > 0 ? 13 : 5
      tail.rotation.y = Math.sin(t * wag) * (0.35 + alert * 0.3 + (bark > 0 ? 0.3 : 0))
      // LED eyes: blink now and then, flash white-amber on a bark or alert
      blinkT -= dt; const blink = blinkT < 0.12 && blinkT > 0 ? 0.08 : 1; if (blinkT <= 0) blinkT = 2 + Math.random() * 3
      for (const e of eyes) e.scale.set(1 + barkK * 0.2, blink, 1)
      eyeMat.color.set(bark > 0 || alert > 0 ? '#ffd27a' : '#7fe0ff').multiplyScalar(3)
      amber.emissiveIntensity = 0.5 + 1.4 * Math.max(bark > 0 ? 1 : 0, alert)
    },
  }
}
