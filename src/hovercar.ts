import * as THREE from 'three'

/** A futuristic hover-car that cruises through the scene: banking turns, bobbing, glowing underbody, headlights and a light trail.
 *  It flies across the background (behind the avatar) every so often; `launch()` sends one on demand. */
const body = new THREE.MeshStandardMaterial({ color: '#e8eef8', metalness: 0.85, roughness: 0.2 })
const dark = new THREE.MeshStandardMaterial({ color: '#10192b', metalness: 0.8, roughness: 0.3 })
const glass = new THREE.MeshStandardMaterial({ color: '#0b2a44', metalness: 0.2, roughness: 0.05, emissive: '#00b4ff', emissiveIntensity: 0.5, transparent: true, opacity: 0.8 })
const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color('#00b4ff').multiplyScalar(3), toneMapped: false })
const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb020').multiplyScalar(3), toneMapped: false })
const red = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b3b').multiplyScalar(3), toneMapped: false })

function trailTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 16
  const g = c.getContext('2d')!, grad = g.createLinearGradient(0, 0, 256, 0)
  grad.addColorStop(0, 'rgba(0,180,255,0.9)'); grad.addColorStop(0.35, 'rgba(0,180,255,0.35)'); grad.addColorStop(1, 'rgba(0,180,255,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 256, 16)
  const v = g.createLinearGradient(0, 0, 0, 16); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, 256, 16)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

export function createHovercar(onFlyby?: (dir: number) => void) {
  const root = new THREE.Group(); root.visible = false
  const car = new THREE.Group(); root.add(car)                    // the car faces +x
  const add = (g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D = car) => { const o = new THREE.Mesh(g, m); p.add(o); return o }
  const hull = add(new THREE.SphereGeometry(0.5, 32, 16), body); hull.scale.set(1.6, 0.26, 0.62)
  const nose = add(new THREE.ConeGeometry(0.16, 0.5, 20), body); nose.rotation.z = -Math.PI / 2; nose.position.x = 0.9; nose.scale.set(1, 1, 0.8)
  const cabin = add(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); cabin.scale.set(0.8, 0.5, 0.42); cabin.position.set(-0.05, 0.1, 0)
  add(new THREE.BoxGeometry(1.5, 0.03, 0.78), dark).position.y = -0.1
  for (const z of [-0.3, 0.3]) { const f = add(new THREE.BoxGeometry(0.5, 0.025, 0.28), body); f.position.set(-0.65, 0.05, z * 1.6); f.rotation.y = z * -0.8 }   // tail fins
  add(new THREE.BoxGeometry(1.3, 0.012, 0.05), cyan).position.set(0, -0.085, 0.38); add(new THREE.BoxGeometry(1.3, 0.012, 0.05), cyan).position.set(0, -0.085, -0.38)
  add(new THREE.BoxGeometry(0.05, 0.05, 0.3), red).position.set(-0.86, 0.02, 0)
  for (const z of [-0.12, 0.12]) add(new THREE.SphereGeometry(0.035, 12, 8), amber).position.set(1.08, 0, z)
  const pods = [-0.45, 0.45].flatMap((x) => [-0.32, 0.32].map((z) => { const d = add(new THREE.CircleGeometry(0.11, 24), cyan); d.rotation.x = -Math.PI / 2; d.position.set(x, -0.14, z); return d }))
  const light = new THREE.PointLight('#00b4ff', 1.6, 3.2); light.position.y = -0.3; car.add(light)
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.1), new THREE.MeshBasicMaterial({ map: trailTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }))
  trail.position.set(-2.4, 0, 0); car.add(trail)
  const trail2 = trail.clone(); trail2.position.y = -0.12; trail2.scale.set(0.7, 0.6, 1); car.add(trail2)

  let t = 0, dur = 1, active = false, enabled = true, wait = 6
  let dir = 1, y0 = 2, amp = 0.35, z = -3.8, span = 5, scale = 1, phase = 0, fast = 1
  const prev = new THREE.Vector3()
  function launch(opts: { dir?: number; y?: number; z?: number; scale?: number; speed?: number } = {}) {
    dir = opts.dir ?? (Math.random() < 0.5 ? -1 : 1); y0 = opts.y ?? 1.5 + Math.random() * 1.4; z = opts.z ?? -(3.4 + Math.random() * 3); scale = opts.scale ?? 0.55 + Math.random() * 0.35
    fast = opts.speed ?? 1; dur = (3.8 + Math.random() * 1.6) / fast; amp = 0.25 + Math.random() * 0.4; phase = Math.random() * 6; span = 5.2 + Math.abs(z) * 0.5
    t = 0; active = true; root.visible = true; root.scale.setScalar(scale); onFlyby?.(dir)
    root.position.set(-dir * span, y0, z); prev.copy(root.position)
  }
  return {
    root, launch,
    setEnabled(v: boolean) { enabled = v; if (!v) { active = false; root.visible = false } },
    update(dt: number) {
      if (!active) { if (enabled) { wait -= dt; if (wait <= 0) { wait = 9 + Math.random() * 8; launch() } } return }
      t += dt; const u = t / dur
      if (u >= 1) { active = false; root.visible = false; return }
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2                       // ease: it leaves slowly, rushes by in the middle, eases out
      const ease = 0.5 * u + 0.5 * e
      const x = -dir * span + dir * 2 * span * ease
      const y = y0 + Math.sin(ease * Math.PI * 2 + phase) * amp
      const zz = z + Math.sin(ease * Math.PI) * 1.2
      root.position.set(x, y, zz)
      // face the direction of travel, bank into the turns, pitch with the climb
      const vx = x - prev.x, vy = y - prev.y, vz = zz - prev.z; prev.copy(root.position)
      const sp = Math.hypot(vx, vz) || 1
      const yawA = Math.atan2(vz, Math.abs(vx) || 1e-3); root.rotation.y = dir > 0 ? -yawA : Math.PI + yawA
      car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, Math.atan2(vy, sp) * 1.6, Math.min(1, dt * 6))
      car.rotation.x = Math.sin(ease * 9 + phase) * 0.18 * (1 - Math.abs(u - 0.5)) + dir * Math.cos(ease * Math.PI * 2 + phase) * 0.22
      car.position.y = Math.sin(t * 7) * 0.02
      const k = 1 + 0.25 * Math.sin(t * 22)
      for (const p of pods) p.scale.setScalar(k)
      light.intensity = 1.2 + 0.6 * Math.sin(t * 18)
      trail.scale.x = 0.7 + Math.min(1, u * 4) * 0.5 * fast; trail2.scale.x = trail.scale.x * 0.7
    },
  }
}
