import * as THREE from 'three'
import gsap from 'gsap'

/** BUILDER-01: the machine on the end card. Spinning gyro rings around a pulsing amber core, two pistons that hammer in turn,
 *  a belt that carries freshly made cubes away, sparks on every strike and a flickering work light. It powers up when it appears. */
const graphite = new THREE.MeshStandardMaterial({ color: '#141c2c', metalness: 0.8, roughness: 0.32 })
const steel = new THREE.MeshStandardMaterial({ color: '#aab6c8', metalness: 0.9, roughness: 0.25 })
const amber = new THREE.MeshStandardMaterial({ color: '#ffb020', metalness: 0.5, roughness: 0.35 })
const led = new THREE.MeshBasicMaterial({ color: new THREE.Color('#00b4ff').multiplyScalar(2.8), toneMapped: false })
const coreMat = new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ff9a00', emissiveIntensity: 2.2, roughness: 0.3 })
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D) => { const o = new THREE.Mesh(g, m); o.castShadow = true; p.add(o); return o }

export function createMachine() {
  const root = new THREE.Group(); root.visible = false
  mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.3, 48), graphite, root).position.y = -0.15
  const ring0 = mesh(new THREE.TorusGeometry(0.35, 0.008, 8, 64), led, root); ring0.rotation.x = Math.PI / 2; ring0.position.y = -0.02
  mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.14, 40), graphite, root).position.y = 0.07
  // frame: two uprights and a crossbeam
  for (const x of [-0.24, 0.24]) mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), amber, root).position.set(x, 0.52, -0.1)
  mesh(new THREE.BoxGeometry(0.58, 0.07, 0.07), amber, root).position.set(0, 0.97, -0.1)
  mesh(new THREE.BoxGeometry(0.4, 0.012, 0.075), led, root).position.set(0, 1.01, -0.1)
  // core and gyro rings
  const core = mesh(new THREE.IcosahedronGeometry(0.1, 2), coreMat, root); core.position.set(0, 0.52, 0)
  const rings = [0, 1, 2].map((i) => { const r = mesh(new THREE.TorusGeometry(0.17 + i * 0.05, 0.007, 8, 80), i === 1 ? amber : led, root); r.position.copy(core.position); r.userData.i = i; return r })
  const coreLight = new THREE.PointLight('#ff9a00', 1.4, 2.2); coreLight.position.copy(core.position); root.add(coreLight)
  // pistons
  const pistons = [-0.15, 0.15].map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 0.0, 0.0); root.add(g)
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 20), graphite, g).position.y = 0.9
    const rod = new THREE.Group(); g.add(rod)
    mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 14), steel, rod).position.y = 0.62
    mesh(new THREE.BoxGeometry(0.09, 0.05, 0.09), steel, rod).position.y = 0.35
    rod.userData.i = i; return rod
  })
  // belt and cubes
  const belt = mesh(new THREE.BoxGeometry(1.1, 0.04, 0.2), graphite, root); belt.position.set(0.2, 0.06, 0.5)
  mesh(new THREE.BoxGeometry(1.1, 0.008, 0.012), led, root).position.set(0.2, 0.084, 0.5)
  const cubes: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) { const c = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), i % 2 ? amber : steel, root); c.userData.p = i / 5; cubes.push(c) }
  // sparks
  const N = 60, sp = new Float32Array(N * 3), sv = new Float32Array(N * 3), sl = new Float32Array(N)
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.03, color: new THREE.Color('#ffd27a').multiplyScalar(2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  sparks.frustumCulled = false; root.add(sparks); for (let i = 0; i < N; i++) sp[i * 3 + 1] = -50
  let sc = 0
  const burst = (x: number) => { for (let k = 0; k < 14; k++) { const i = sc++ % N; sp[i * 3] = x; sp[i * 3 + 1] = 0.16; sp[i * 3 + 2] = 0.0; sv[i * 3] = (Math.random() - 0.5) * 1.1; sv[i * 3 + 1] = 0.5 + Math.random() * 0.9; sv[i * 3 + 2] = (Math.random() - 0.2) * 0.8; sl[i] = 0.5 + Math.random() * 0.4 } }

  const state = { power: 0 }                         // 0 = off, 1 = full speed
  const lastDown = [false, false]
  return {
    root,
    /** appears with a power-up: scales in, the rings spin up and the core flares */
    setActive(on: boolean) {
      if (on) { root.visible = true; const k = (root.userData.s as number | undefined) ?? 0.9; root.scale.setScalar(0.001); gsap.to(root.scale, { x: k, y: k, z: k, duration: 1.2, ease: 'back.out(1.5)' }); gsap.to(state, { power: 1, duration: 2.5, delay: 0.6, ease: 'power2.in' }) }
      else if (root.visible) gsap.to(state, { power: 0, duration: 0.6, onComplete: () => { root.visible = false } })
    },
    update(dt: number, t: number) {
      if (!root.visible) return
      const p = state.power
      for (const r of rings) { const i = r.userData.i; r.rotation.set(t * (0.6 + i * 0.4) * p * (i % 2 ? -1 : 1), t * (0.9 - i * 0.25) * p, i * 1.0 + t * 0.2 * p) }
      core.rotation.y += dt * 1.5 * p
      const pulse = 1 + 0.18 * Math.sin(t * 5 * p) * p
      core.scale.setScalar(pulse); coreMat.emissiveIntensity = 0.6 + 2.4 * p * (0.8 + 0.2 * Math.sin(t * 9)); coreLight.intensity = 0.3 + 1.6 * p * (0.8 + 0.2 * Math.sin(t * 13 + 1))
      pistons.forEach((rod, i) => {
        const ph = Math.sin(t * 3.2 * p + i * Math.PI), y = ph > 0 ? -ph * 0.3 : -ph * 0.05
        rod.position.y = 0.45 * (p > 0.05 ? 1 : 0) * 0 + y * p
        const down = ph > 0.92 && p > 0.5
        if (down && !lastDown[i]) burst(pistons[i].parent!.position.x)
        lastDown[i] = down
      })
      for (const c of cubes) {
        c.userData.p = (c.userData.p + dt * 0.12 * p) % 1
        const u = c.userData.p
        c.position.set(-0.3 + u * 1.1, 0.14 + (u < 0.1 ? (0.1 - u) * 1.2 : 0), 0.5)
        c.scale.setScalar(Math.min(1, u * 8) * (u > 0.9 ? (1 - u) * 10 : 1) + 0.001)
        c.rotation.y = u * 2
      }
      for (let i = 0; i < N; i++) {
        if (sl[i] <= 0) { sp[i * 3 + 1] = -50; continue }
        sl[i] -= dt; sv[i * 3 + 1] -= 2.4 * dt
        sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt
      }
      sGeo.attributes.position.needsUpdate = true
    },
  }
}
