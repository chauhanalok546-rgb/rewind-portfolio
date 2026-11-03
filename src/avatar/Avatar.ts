import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface VisemeCue { t: number; d: number; v: string }

const MAX_YAW = THREE.MathUtils.degToRad(35)
const MAX_PITCH = THREE.MathUtils.degToRad(15)
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

/** Loads avatar.glb and drives idle breathing, blinking, eye/head look-at and viseme lip-sync. */
export class Avatar {
  readonly root = new THREE.Group()
  private morphMeshes: THREE.Mesh[] = []
  private bones = new Map<string, THREE.Bone>()
  private rest = new Map<string, THREE.Quaternion>()
  private target = new THREE.Vector2()           // look target in -1..1
  private look = new THREE.Vector2()             // smoothed
  private values = new Map<string, number>()     // morph values currently applied
  private wanted = new Map<string, number>()     // morph values requested this frame
  private nextBlink = 1.5
  private blinkT = -1
  private doubleBlink = false
  private clock = 0
  private cues: VisemeCue[] = []
  private audio?: HTMLAudioElement

  async load(url: string) {
    const gltf = await new GLTFLoader().loadAsync(url)
    this.root.add(gltf.scene)
    gltf.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone)
      const m = o as THREE.Mesh
      if (m.isMesh && m.morphTargetDictionary) {
        this.morphMeshes.push(m)
        m.frustumCulled = false
        m.castShadow = true
      }
    })
    for (const [n, b] of this.bones) this.rest.set(n, b.quaternion.clone())
    this.relaxArms()
    return this
  }

  get morphCount() { return this.morphMeshes[0]?.morphTargetDictionary ? Object.keys(this.morphMeshes[0].morphTargetDictionary).length : 0 }

  /** The export is in a T-pose: bring the arms down to a relaxed stance. */
  private relaxArms() {
    this.root.updateMatrixWorld(true)
    for (const side of ['Left', 'Right']) {
      const arm = this.bones.get(`${side}Arm`)
      const fore = this.bones.get(`${side}ForeArm`)
      const hand = this.bones.get(`${side}Hand`)
      if (!arm || !fore) continue
      const out = side === 'Left' ? 1 : -1
      // swing the upper arm in world space until it points down (slightly away from the body)
      this.aimBone(arm, fore, new THREE.Vector3(out * 0.12, -1, 0.02))
      this.root.updateMatrixWorld(true)
      if (hand) this.aimBone(fore, hand, new THREE.Vector3(out * 0.10, -1, 0.22))
      this.root.updateMatrixWorld(true)
    }
  }

  private aimBone(bone: THREE.Bone, child: THREE.Bone, dirWorld: THREE.Vector3) {
    const p = bone.getWorldPosition(new THREE.Vector3())
    const c = child.getWorldPosition(new THREE.Vector3())
    const cur = c.sub(p).normalize()
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, dirWorld.clone().normalize())
    const boneWorldQ = bone.getWorldQuaternion(new THREE.Quaternion())
    const parentWorldQ = (bone.parent as THREE.Object3D).getWorldQuaternion(new THREE.Quaternion())
    bone.quaternion.copy(parentWorldQ.invert().multiply(delta).multiply(boneWorldQ))
    this.rest.set(bone.name, bone.quaternion.clone())
  }

  setLookTarget(x: number, y: number) { this.target.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)) }

  blinkNow() { if (this.blinkT < 0) this.blinkT = 0 }

  async speak(audioUrl: string, cuesUrl: string, onEnd?: () => void) {
    const data = await (await fetch(cuesUrl)).json()
    this.cues = data.cues
    this.audio?.pause()
    this.audio = new Audio(audioUrl)
    this.audio.onended = () => { this.cues = []; onEnd?.() }
    await this.audio.play()
  }

  private want(name: string, v: number) { this.wanted.set(name, Math.max(this.wanted.get(name) ?? 0, v)) }

  update(dt: number) {
    this.clock += dt
    this.wanted.clear()

    // breathing + tiny sway
    const spine2 = this.bones.get('Spine2')
    const spine = this.bones.get('Spine')
    const breath = Math.sin(this.clock * 1.6)
    if (spine2) spine2.quaternion.copy(this.rest.get('Spine2')!).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(breath * 0.012, 0, Math.sin(this.clock * 0.5) * 0.006)))
    if (spine) spine.quaternion.copy(this.rest.get('Spine')!).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(this.clock * 0.35) * 0.015, 0)))

    // look-at: eyes lead, head follows (limited to ~35° yaw)
    this.look.x = damp(this.look.x, this.target.x, 5, dt)
    this.look.y = damp(this.look.y, this.target.y, 5, dt)
    const yaw = this.look.x * MAX_YAW
    const pitch = -this.look.y * MAX_PITCH
    this.applyLook('Neck', yaw * 0.35, pitch * 0.35)
    this.applyLook('Head', yaw * 0.65, pitch * 0.65)
    for (const eye of ['LeftEye', 'RightEye']) this.applyLook(eye, yaw * 0.4, pitch * 0.4)

    // blinking: 120–180 ms, every 2–6 s, occasional double blink
    if (this.blinkT < 0) {
      this.nextBlink -= dt
      if (this.nextBlink <= 0) { this.blinkT = 0; this.doubleBlink = Math.random() < 0.15 }
    } else {
      this.blinkT += dt
      const dur = 0.15
      const k = this.blinkT / dur
      const w = k < 0.4 ? k / 0.4 : Math.max(0, 1 - (k - 0.4) / 0.6)
      this.want('eyeBlinkLeft', w); this.want('eyeBlinkRight', w)
      if (this.blinkT >= dur) {
        this.blinkT = -1
        this.nextBlink = this.doubleBlink ? 0.12 : 2 + Math.random() * 4
        this.doubleBlink = false
      }
    }

    // lip-sync
    if (this.audio && this.cues.length) {
      const t = this.audio.currentTime
      const cue = this.cues.find((c) => t >= c.t && t < c.t + c.d)
      if (cue && cue.v !== 'viseme_sil') {
        const phase = (t - cue.t) / cue.d
        this.want(cue.v, Math.sin(Math.PI * Math.min(1, phase)) * 0.9 + 0.1)
      }
    }
    // calm default face
    this.want('mouthClose', 0.0)

    // apply with smoothing
    const names = new Set([...this.values.keys(), ...this.wanted.keys()])
    for (const n of names) {
      const target = this.wanted.get(n) ?? 0
      const fast = n.startsWith('eyeBlink')
      const v = damp(this.values.get(n) ?? 0, target, fast ? 40 : 22, dt)
      this.values.set(n, v)
      for (const m of this.morphMeshes) {
        const i = m.morphTargetDictionary![n]
        if (i !== undefined) m.morphTargetInfluences![i] = v
      }
    }
  }

  private applyLook(boneName: string, yaw: number, pitch: number) {
    const b = this.bones.get(boneName); const r = this.rest.get(boneName)
    if (!b || !r) return
    b.quaternion.copy(r).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')))
  }

  headPosition(): THREE.Vector3 {
    const h = this.bones.get('Head')
    return h ? h.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.7, 0)
  }
}
