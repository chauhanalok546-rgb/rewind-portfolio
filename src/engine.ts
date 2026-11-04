import * as THREE from 'three'
import { mergeStatic } from './mergeStatic'

/** The Chrono Engine: a big machine at the back of the lab. Two interlocking cog wheels turn against each other around glowing hubs,
 *  with pulses of light running round the rims, sweeping beams and a pulsing core. It sits deep behind the avatar, softly fogged. */
const iron = new THREE.MeshStandardMaterial({ color: '#1a2438', metalness: 0.85, roughness: 0.35 })
const rim = new THREE.MeshStandardMaterial({ color: '#2a3a58', metalness: 0.9, roughness: 0.3 })
const amber = new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ff9a00', emissiveIntensity: 1.4, metalness: 0.4, roughness: 0.4 })
const glow = (c: string, k = 2.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false })

function cog(radius: number, teeth: number, thick: number) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thick, 64), iron); body.rotation.x = Math.PI / 2; g.add(body)
  const toothGeo = new THREE.BoxGeometry(radius * 0.2, radius * 0.17, thick * 1.0)
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, t = new THREE.Mesh(toothGeo, rim)
    t.position.set(Math.cos(a) * (radius + radius * 0.07), Math.sin(a) * (radius + radius * 0.07), 0); t.rotation.z = a; g.add(t)
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.8, radius * 0.012, 8, 96), glow('#00b4ff')); ring.position.z = thick / 2 + 0.003; g.add(ring)
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.45, radius * 0.01, 8, 80), glow('#ffb020', 2)); ring2.position.z = thick / 2 + 0.003; g.add(ring2)
  for (let i = 0; i < 6; i++) {                                    // spokes
    const s = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.7, radius * 0.06, thick * 0.6), rim); const a = (i / 6) * Math.PI * 2
    s.position.set(Math.cos(a) * radius * 0.45, Math.sin(a) * radius * 0.45, 0); s.rotation.z = a; g.add(s)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.14, radius * 0.14, thick * 1.6, 24), amber); hub.rotation.x = Math.PI / 2; g.add(hub)
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.045, 12, 8), glow('#baf0ff', 4)); pulse.position.z = thick / 2 + 0.01; g.add(pulse)
  g.userData = { pulse, r: radius * 0.8 }
  return g
}

export function createEngine() {
  const root = new THREE.Group()
  const A = cog(1.15, 22, 0.22), B = cog(0.75, 14, 0.22), C = cog(0.5, 10, 0.22)
  for (const g of [A, B, C]) mergeStatic(g, [g.userData.pulse as THREE.Object3D])        // 100+ tiny meshes (teeth, spokes, rings) become a few
  A.position.set(-0.55, 1.95, 0); B.position.set(1.1, 1.45, 0); C.position.set(0.2, 3.25, 0)
  root.add(A, B, C)
  // interlock: A and B turn against each other with a ratio of their teeth; C meshes with A
  const ratioB = 22 / 14, ratioC = 22 / 10
  // frame
  for (const x of [-2.1, 2.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 0.16), iron); p.position.set(x, 1.7, -0.25); root.add(p) }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 0.16), iron); beam.position.set(0.05, 3.95, -0.25); root.add(beam)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.014, 0.18), glow('#00b4ff')); strip.position.set(0.05, 3.89, -0.25); root.add(strip)
  const pistons = [-1.4, 1.7].map((x) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 16), rim); r.position.set(x, 0.65, -0.1); root.add(r); return r })
  // sweeping beams from the main hub
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#00b4ff'), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const beams = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.35), beamMat); m.position.set(-0.55, 1.95, 0.2); root.add(m); return m })
  const light = new THREE.PointLight('#ff9a00', 2.2, 8); light.position.set(-0.55, 1.95, 1); root.add(light)
  // a conveyor under the machine carrying glowing crates, steam venting from the frame, sparks where the cogs mesh
  const belt = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 0.5), iron); belt.position.set(0.05, -0.02, 0.3); root.add(belt)
  const beltLed = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.012, 0.03), glow('#00b4ff')); beltLed.position.set(0.05, 0.05, 0.55); root.add(beltLed)
  const crates: THREE.Mesh[] = []
  for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), i % 2 ? amber : rim); c.userData.u = i / 7; root.add(c); crates.push(c) }
  const N = 90, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), kind = new Float32Array(N)
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const fx = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, color: new THREE.Color('#ffd27a').multiplyScalar(2.2), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  fx.frustumCulled = false; root.add(fx); for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50
  let cur = 0
  const emit = (x: number, y: number, z: number, spark: boolean) => {
    const i = cur++ % N; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
    vel[i * 3] = (Math.random() - 0.5) * (spark ? 1.6 : 0.3); vel[i * 3 + 1] = spark ? 0.6 + Math.random() * 1.2 : 0.6 + Math.random() * 0.5; vel[i * 3 + 2] = (Math.random() - 0.3) * 0.6
    life[i] = spark ? 0.5 + Math.random() * 0.4 : 1.4 + Math.random(); kind[i] = spark ? 1 : 0
  }
  let nextVent = 0, nextSpark = 0
  const spin = { v: 0.35 }
  return {
    root,
    update(dt: number, t: number) {
      if (!root.visible) return
      const cycle = 0.5 + 0.5 * Math.sin(t * 0.7)                                   // working rhythm: spin up, run hard, ease off
      spin.v = 0.22 + 0.75 * cycle * cycle
      const w = spin.v * dt
      A.rotation.z += w; B.rotation.z -= w * ratioB; B.rotation.z += 0; C.rotation.z -= w * ratioC
      // run the pulse spheres around each rim
      for (const [g, k] of [[A, 1], [B, -ratioB], [C, ratioC]] as const) { const p = g.userData.pulse as THREE.Mesh, r = g.userData.r as number, a = t * 1.8 * Math.sign(k) + g.id; p.position.set(Math.cos(a - g.rotation.z) * r, Math.sin(a - g.rotation.z) * r, 0.12) }
      beams.forEach((b, i) => { b.rotation.z = t * 0.5 * (i ? -1 : 1) + i * 1.2; b.scale.x = 0.8 + 0.2 * Math.sin(t * 2 + i) })
      pistons.forEach((p, i) => { p.position.y = 0.65 + Math.sin(t * (2.4 + 3 * cycle) + i * 2) * 0.3 })
      for (const c of crates) { c.userData.u = (c.userData.u + dt * (0.04 + 0.05 * cycle)) % 1; const u = c.userData.u; c.position.set(-2.4 + u * 4.9, 0.18, 0.3); c.scale.setScalar(Math.min(1, u * 8, (1 - u) * 8) + 0.001); c.rotation.y = u * 3 }
      nextVent -= dt; if (nextVent <= 0) { nextVent = 0.12 + Math.random() * 0.3; emit(-1.4 + Math.random() * 3.2, 0.2 + Math.random() * 0.4, -0.05, false) }
      nextSpark -= dt; if (nextSpark <= 0) { nextSpark = 0.08 + (1 - cycle) * 0.35; emit(0.28, 1.72, 0.2, true) }                 // where cog A meets cog B
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -50; continue }
        life[i] -= dt; if (kind[i]) vel[i * 3 + 1] -= 2.6 * dt
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt
      }
      geo.attributes.position.needsUpdate = true
      amber.emissiveIntensity = 1.1 + 0.6 * Math.sin(t * 3.1); light.intensity = 1.8 + 0.8 * Math.sin(t * 4.3)
    },
  }
}
