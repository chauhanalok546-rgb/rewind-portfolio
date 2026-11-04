import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Bakes every static mesh under `group` into one mesh per material, so a part made of dozens of small meshes costs a handful of draw calls.
 *  Anything inside an `exclude` subtree (moving child groups, animated meshes, lights) is left exactly as it is. */
export function mergeStatic(group: THREE.Object3D, exclude: THREE.Object3D[] = []) {
  group.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert()
  const skip = new Set<THREE.Object3D>(exclude)
  const inSkipped = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== group; p = p.parent) if (skip.has(p)) return true; return false }
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>(); const dead: THREE.Mesh[] = []
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || Array.isArray(m.material) || inSkipped(m)) return
    const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    const list = byMat.get(m.material as THREE.Material) ?? []; list.push(g); byMat.set(m.material as THREE.Material, list); dead.push(m)
  })
  for (const m of dead) m.removeFromParent()
  for (const [mat, list] of byMat) { const merged = mergeGeometries(list.map((g) => (g.index ? g : g)), false); if (merged) { const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = false; group.add(mesh) } }
  return dead.length
}
