import * as THREE from 'three'
import { mergeStatic } from './mergeStatic'

/** ARM-01: an articulated robotic arm (base yaw, shoulder, elbow, wrist, two-finger gripper) driven by a small two-link IK solver.
 *  It idles with a slow sway, can reach for a point, press a button, wave and "write" (tap along a line). All motion is critically damped. */
const L1 = 0.5, L2 = 0.44, SHOULDER_Y = 0.46
const amber = new THREE.MeshStandardMaterial({ color: '#ffb020', metalness: 0.55, roughness: 0.32 })
const graphite = new THREE.MeshStandardMaterial({ color: '#141c2c', metalness: 0.8, roughness: 0.3 })
const steel = new THREE.MeshStandardMaterial({ color: '#aab6c8', metalness: 0.9, roughness: 0.25 })
const led = new THREE.MeshBasicMaterial({ color: new THREE.Color('#00b4ff').multiplyScalar(2.8), toneMapped: false })

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D) => { const o = new THREE.Mesh(g, m); o.castShadow = false; parent.add(o); return o }
function limb(parent: THREE.Object3D, len: number, w: number) {
  const b = mesh(new THREE.BoxGeometry(len, w, w * 1.1), amber, parent); b.position.x = len / 2
  mesh(new THREE.BoxGeometry(len * 0.8, w * 0.35, w * 1.16), graphite, parent).position.set(len / 2, 0, 0)       // dark inset panel
  const strip = mesh(new THREE.BoxGeometry(len * 0.6, 0.008, w * 1.18), led, parent); strip.position.set(len / 2, w / 2 + 0.002, 0)
  return b
}
const joint = (parent: THREE.Object3D, r: number) => { const j = mesh(new THREE.CylinderGeometry(r, r, r * 1.5, 28), graphite, parent); j.rotation.x = Math.PI / 2; const c = mesh(new THREE.TorusGeometry(r * 0.72, 0.008, 8, 32), led, parent); c.position.z = r * 0.76; return j }

export function createRobot() {
  const root = new THREE.Group()
  const plinth = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 48), graphite, root); plinth.position.y = -0.15; plinth.receiveShadow = true
  const plinthRing = mesh(new THREE.TorusGeometry(0.31, 0.008, 8, 64), led, root); plinthRing.rotation.x = Math.PI / 2; plinthRing.position.y = -0.02
  const base = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.1, 40), graphite, root); base.position.y = 0.05; base.receiveShadow = true
  const ring = mesh(new THREE.TorusGeometry(0.22, 0.009, 8, 64), led, root); ring.rotation.x = Math.PI / 2; ring.position.y = 0.102
  mesh(new THREE.CylinderGeometry(0.13, 0.16, SHOULDER_Y - 0.1, 28), amber, root).position.y = (SHOULDER_Y + 0.1) / 2

  // work cell: two glowing pads and a cube the arm shuttles between them, forever
  const PAD_A = new THREE.Vector3(0.58, 0.02, 0.3), PAD_B = new THREE.Vector3(0.58, 0.02, -0.3)
  for (const p of [PAD_A, PAD_B]) {
    const pad = mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.03, 32), graphite, root); pad.position.set(p.x, p.y - 0.015, p.z)
    const pr = mesh(new THREE.TorusGeometry(0.1, 0.006, 8, 40), led, root); pr.rotation.x = Math.PI / 2; pr.position.set(p.x, p.y + 0.002, p.z)
  }
  const cube = mesh(new THREE.BoxGeometry(0.075, 0.075, 0.075), amber, root); cube.position.copy(PAD_A).y += 0.04
  mesh(new THREE.BoxGeometry(0.079, 0.012, 0.079), led, cube).position.y = 0.0
  const yaw = new THREE.Group(); yaw.position.y = SHOULDER_Y; root.add(yaw)
  joint(yaw, 0.1)
  const upper = new THREE.Group(); yaw.add(upper); limb(upper, L1, 0.1)
  const fore = new THREE.Group(); fore.position.x = L1; upper.add(fore); joint(fore, 0.075); limb(fore, L2, 0.075)
  const wrist = new THREE.Group(); wrist.position.x = L2; fore.add(wrist); joint(wrist, 0.05)
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 20), steel, wrist).rotation.z = Math.PI / 2
  const fingers = [1, -1].map((s) => { const f = mesh(new THREE.BoxGeometry(0.1, 0.014, 0.02), steel, wrist); f.position.set(0.09, 0, 0.02 * s); return f })
  const pointLight = new THREE.PointLight('#00b4ff', 0.6, 1.4); pointLight.position.set(0.1, 0.05, 0.1); wrist.add(pointLight)

  // merge the rigid pieces of each link (the moving groups stay separate)
  mergeStatic(upper, [fore]); mergeStatic(fore, [wrist]); mergeStatic(wrist, [...fingers, pointLight]); mergeStatic(yaw, [upper])
  const target = new THREE.Vector3(0.4, 0.62, 0.15), goal = target.clone(), vel = new THREE.Vector3()
  let mode: 'idle' | 'reach' = 'idle', fired = false, step = 0, stepT = 0, carrying = false, from = PAD_A, to = PAD_B, grip = 0.7, gripGoal = 0.7, timer = 0, hold = 0
  const world = new THREE.Vector3()

  function solve(tl: THREE.Vector3) {
    yaw.rotation.y = -Math.atan2(tl.z, tl.x)
    const r = Math.hypot(tl.x, tl.z), h = tl.y - SHOULDER_Y
    const d = Math.min(Math.max(Math.hypot(r, h), 0.18), L1 + L2 - 0.005)
    const gamma = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))
    const alpha = Math.acos((d * d + L1 * L1 - L2 * L2) / (2 * d * L1))
    const a1 = Math.atan2(h, r) + alpha, a2 = -(Math.PI - gamma)
    upper.rotation.z = a1; fore.rotation.z = a2
    wrist.rotation.z = -(a1 + a2) - 0.9                       // keep the gripper pointing down and forward
  }
  solve(target)

  return {
    root,
    /** reach a point given in the robot's local space; returns to idle after `holdSec` */
    reach(local: THREE.Vector3, holdSec = 0.8) { goal.copy(local); mode = 'reach'; hold = holdSec; timer = 0; gripGoal = 0.1 },
    /** a quick press: jab forward and back */
    press(local: THREE.Vector3) { goal.copy(local); mode = 'reach'; hold = 0.35; timer = 0; gripGoal = 0 },
    localFromWorld(w: THREE.Vector3) { return root.worldToLocal(world.copy(w)) },
    update(dt: number) {
      timer += dt
      if (mode === 'reach' && timer > hold + 0.6) { mode = 'idle'; gripGoal = 0.7 }
      if (mode === 'idle') {
        // pick-and-place: hover over the cube, lower, grip, lift, carry, lower, release, lift, then back the other way
        stepT += dt
        const hover = 0.34, low = 0.17
        const at = (p: THREE.Vector3, y: number) => goal.set(p.x - 0.08, y, p.z)
        const STEPS: Array<[number, () => void]> = [
          [0.9, () => { at(from, hover); gripGoal = 0.8 }],
          [0.7, () => at(from, low)],
          [0.5, () => { gripGoal = 0.05; if (!carrying) { carrying = true; wrist.attach(cube); cube.position.set(0.15, -0.045, 0); cube.rotation.set(0, 0, 0) } }],
          [0.7, () => at(from, hover)],
          [1.0, () => at(to, hover)],
          [0.7, () => at(to, low)],
          [0.5, () => { gripGoal = 0.8; if (carrying) { carrying = false; root.attach(cube); cube.position.copy(to).y += 0.04; cube.rotation.set(0, 0, 0) } }],
          [0.6, () => { at(to, hover); const tmp = from; from = to; to = tmp }],
        ]
        if (!fired) { fired = true; STEPS[step][1]() }
        else if (stepT >= STEPS[step][0]) { step = (step + 1) % STEPS.length; stepT = 0; fired = false }
      }
      // critically damped follow (spring), so the arm eases in and out
      const k = 40, c = 2 * Math.sqrt(k)
      vel.x += ((goal.x - target.x) * k - vel.x * c) * dt; vel.y += ((goal.y - target.y) * k - vel.y * c) * dt; vel.z += ((goal.z - target.z) * k - vel.z * c) * dt
      target.addScaledVector(vel, dt)
      solve(target)
      grip += (gripGoal - grip) * Math.min(1, dt * 8)
      fingers[0].position.z = 0.012 + grip * 0.05; fingers[1].position.z = -(0.012 + grip * 0.05)
      ring.rotation.z += dt * 0.8
    },
  }
}
