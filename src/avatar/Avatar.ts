import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type Expression = 'neutral' | 'happy' | 'serious' | 'proud'

/** morph weights for each mood (ARKit names) */
const EXPRESSIONS: Record<Expression, Record<string, number>> = {
  neutral: { mouthSmileLeft: 0.06, mouthSmileRight: 0.06 },
  happy: { mouthSmileLeft: 0.7, mouthSmileRight: 0.7, cheekSquintLeft: 0.25, cheekSquintRight: 0.25, browInnerUp: 0.12, eyeSquintLeft: 0.12, eyeSquintRight: 0.12 },
  serious: { browDownLeft: 0.3, browDownRight: 0.3, mouthFrownLeft: 0.12, mouthFrownRight: 0.12, mouthPressLeft: 0.1, mouthPressRight: 0.1 },
  proud: { mouthSmileLeft: 0.22, mouthSmileRight: 0.22, browInnerUp: 0.05, browOuterUpLeft: 0.18, browOuterUpRight: 0.18 },
}


export type Gesture = 'wave' | 'namaste' | 'snap' | 'thumbs_up' | 'talk1' | 'talk2' | 'present' | 'point'

type V3 = [number, number, number]
interface ArmPose { arm: V3; fore: V3; hand?: V3; fingers?: number[] }   // fingers: thumb, index, middle, ring, pinky curl 0..1
interface GesturePose { L?: ArmPose; R?: ArmPose }
interface GestureDef { dur: number; pose: (t: number) => GesturePose }

const REST_ARM: ArmPose = { arm: [0.12, -1, 0.02], fore: [0.10, -1, 0.22], fingers: [0.15, 0.2, 0.2, 0.2, 0.2] }
const osc = (t: number, hz: number) => Math.sin(t * Math.PI * 2 * hz)
const GESTURES: Record<Gesture, GestureDef> = {
  wave: { dur: 2.6, pose: (t) => ({ R: { arm: [1, 0.30, 0.05], fore: [0.15 + osc(t, 2.4) * 0.55, 1, 0.08], fingers: [0, 0, 0, 0, 0] } }) },
  namaste: { dur: 2.8, pose: () => ({
    L: { arm: [0.18, -0.9, 0.32], fore: [-0.55, 0.5, 0.68], fingers: [0, 0, 0, 0, 0] },
    R: { arm: [0.18, -0.9, 0.32], fore: [-0.55, 0.5, 0.68], fingers: [0, 0, 0, 0, 0] } }) },
  snap: { dur: 1.5, pose: (t) => {
    const flick = t > 0.78 && t < 0.9 ? 1 : 0                       // middle finger slips off the thumb
    const press = t < 0.78 ? Math.min(1, t / 0.5) : 0
    return { R: { arm: [0.28, -0.75, 0.55], fore: [-0.1, 0.78, 0.6], fingers: [0.3 + press * 0.3, 0.9, 0.9 * press + 0.5 * (1 - press) - flick * 0.9, 0.9, 0.9] } }
  } },
  thumbs_up: { dur: 2.0, pose: () => ({ R: { arm: [0.3, -0.8, 0.5], fore: [0.12, 0.55, 0.85], fingers: [0, 1, 1, 1, 1] } }) },
  talk1: { dur: 2.2, pose: (t) => ({ R: { arm: [0.38, -0.85, 0.4], fore: [0.2 + osc(t, 0.7) * 0.15, 0.2 + osc(t, 1.4) * 0.12, 1], fingers: [0.15, 0.2, 0.25, 0.3, 0.3] } }) },
  talk2: { dur: 2.6, pose: (t) => ({
    L: { arm: [0.45, -0.8, 0.4], fore: [0.3, 0.15 + osc(t, 1.1) * 0.12, 1], fingers: [0.1, 0.15, 0.2, 0.25, 0.3] },
    R: { arm: [0.45, -0.8, 0.4], fore: [0.3, 0.15 + osc(t + 0.3, 1.1) * 0.12, 1], fingers: [0.1, 0.15, 0.2, 0.25, 0.3] } }) },
  present: { dur: 2.4, pose: () => ({ R: { arm: [0.6, -0.7, 0.4], fore: [0.55, 0.2, 0.8], fingers: [0.05, 0.05, 0.05, 0.05, 0.05] } }) },
  point: { dur: 2.2, pose: () => ({ R: { arm: [1, -0.15, 0.25], fore: [1, 0.0, 0.3], fingers: [0.6, 0, 1, 1, 1] } }) },
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export interface VisemeCue { t: number; d: number; v: string }

const MAX_YAW = THREE.MathUtils.degToRad(35)
const MAX_PITCH = THREE.MathUtils.degToRad(15)
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

/** Loads avatar.glb and drives idle breathing, blinking, eye/head look-at and viseme lip-sync. */
const speakingNow = (a: { audio?: HTMLAudioElement; cues: VisemeCue[] }) => !!(a.audio && !a.audio.paused && a.cues.length)

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
  cues: VisemeCue[] = []
  audio?: HTMLAudioElement
  private expr: Expression = 'neutral'
  private exprMix = new Map<string, number>()
  private saccade = new THREE.Vector2()
  private saccadeT = 1
  private weightShift = 0
  private weightShiftTarget = 0
  private weightT = 6
  private gesture?: { def: GestureDef; t: number; name: Gesture; fired: boolean }
  private gestureBlend = 0
  private nextTalkGesture = 1.2

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

  /** Fired at key moments of a gesture (e.g. 'snap' when the fingers slip, for the sound and the white flash). */
  onEvent?: (name: 'snap') => void

  play(g: Gesture) { this.gesture = { def: GESTURES[g], t: 0, name: g, fired: false } }
  get gestureActive() { return !!this.gesture }

  setExpression(e: Expression) { this.expr = e }

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

    this.updateGesture(dt, speakingNow(this))

    // saccades: small quick eye glances every 0.5-2 s (eyes lead, head barely follows)
    this.saccadeT -= dt
    if (this.saccadeT <= 0) {
      this.saccadeT = 0.5 + Math.random() * 1.5
      this.saccade.set((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.12)
    }
    // slow head drift so the face is never frozen
    const drift = new THREE.Vector2(Math.sin(this.clock * 0.41) * 0.035 + Math.sin(this.clock * 0.93) * 0.015, Math.sin(this.clock * 0.53 + 1) * 0.025)

    // look-at: eyes lead, head follows (limited to ~35 deg yaw)
    this.look.x = damp(this.look.x, this.target.x, 5, dt)
    this.look.y = damp(this.look.y, this.target.y, 5, dt)
    const yaw = (this.look.x + drift.x) * MAX_YAW
    const pitch = -(this.look.y + drift.y) * MAX_PITCH
    const speaking = !!(this.audio && !this.audio.paused && this.cues.length)
    const nod = speaking ? Math.sin(this.clock * 2.4) * 0.02 + Math.sin(this.clock * 5.1) * 0.008 : 0
    this.applyLook('Neck', yaw * 0.35, pitch * 0.35 + nod * 0.4)
    this.applyLook('Head', yaw * 0.65, pitch * 0.65 + nod * 0.6)
    const eyeYaw = yaw * 0.4 + this.saccade.x * MAX_YAW
    const eyePitch = pitch * 0.4 - this.saccade.y * MAX_PITCH
    for (const eye of ['LeftEye', 'RightEye']) this.applyLook(eye, eyeYaw, eyePitch)

    // weight shift every 6-10 s
    this.weightT -= dt
    if (this.weightT <= 0) { this.weightT = 6 + Math.random() * 4; this.weightShiftTarget = (Math.random() < 0.5 ? -1 : 1) * 0.012 }
    this.weightShift = damp(this.weightShift, this.weightShiftTarget, 1.2, dt)
    const hips = this.bones.get('Hips')
    if (hips) hips.quaternion.copy(this.rest.get('Hips')!).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, this.weightShift)))

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

    // mood (blended) + tiny brow life
    const mood = EXPRESSIONS[this.expr]
    for (const n of new Set([...this.exprMix.keys(), ...Object.keys(mood)])) {
      const v = damp(this.exprMix.get(n) ?? 0, mood[n] ?? 0, 3, dt)
      this.exprMix.set(n, v)
      if (v > 0.002) this.want(n, v * (speaking ? 0.7 : 1))
    }
    this.want('browInnerUp', 0.05 + 0.04 * Math.max(0, Math.sin(this.clock * 0.7)))
    // look down a little -> lids follow
    if (this.look.y + drift.y < -0.2) { const k = Math.min(0.35, -(this.look.y + drift.y) * 0.4); this.want('eyeBlinkLeft', k); this.want('eyeBlinkRight', k) }

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


  /** Poses the arms/hands for the active gesture (blended in/out); bones are reset to the relaxed rest first. */
  private updateGesture(dt: number, speaking: boolean) {
    // while talking, throw in an occasional talking gesture
    if (speaking && !this.gesture) {
      this.nextTalkGesture -= dt
      if (this.nextTalkGesture <= 0) {
        this.nextTalkGesture = 1 + Math.random() * 1.5
        this.play((['talk1', 'talk2', 'present'] as Gesture[])[Math.floor(Math.random() * 3)])
      }
    }
    let w = 0
    let pose: GesturePose = {}
    if (this.gesture) {
      this.gesture.t += dt
      const { def, t } = this.gesture
      if (this.gesture.name === 'snap' && !this.gesture.fired && t >= 0.8) { this.gesture.fired = true; this.onEvent?.('snap') }
      if (t >= def.dur) this.gesture = undefined
      else { w = smooth(0, 0.4, t) * smooth(0, 0.45, def.dur - t); pose = def.pose(t) }
    }
    if (w <= 0 && this.gestureBlend <= 0) return
    this.gestureBlend = w
    for (const side of ['Left', 'Right'] as const) {
      const key = side === 'Left' ? 'L' : 'R'
      const target = pose[key]
      this.poseArm(side, target ?? REST_ARM, target ? w : 0)
    }
  }

  private poseArm(side: 'Left' | 'Right', p: ArmPose, w: number) {
    const sgn = side === 'Left' ? 1 : -1
    const arm = this.bones.get(side + 'Arm'), fore = this.bones.get(side + 'ForeArm'), hand = this.bones.get(side + 'Hand')
    if (!arm || !fore || !hand) return
    for (const b of [arm, fore, hand]) b.quaternion.copy(this.rest.get(b.name)!)
    arm.updateWorldMatrix(false, true)
    const mix = (a: V3, b: V3) => new THREE.Vector3(a[0] * sgn, a[1], a[2]).normalize().lerp(new THREE.Vector3(b[0] * sgn, b[1], b[2]).normalize(), w).normalize()
    this.aim(arm, fore, mix(REST_ARM.arm, p.arm)); arm.updateWorldMatrix(false, true)
    this.aim(fore, hand, mix(REST_ARM.fore, p.fore)); fore.updateWorldMatrix(false, true)
    if (p.hand) { this.aim(hand, hand.children[0] as THREE.Bone, mix(p.fore, p.hand)); }
    const names = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
    const base = REST_ARM.fingers!, tgt = p.fingers ?? base
    names.forEach((f, i) => {
      const curl = base[i] + (tgt[i] - base[i]) * w
      ;[1, 2, 3].forEach((seg, j) => {
        const b = this.bones.get(`${side}Hand${f}${seg}`)
        if (b) { b.quaternion.copy(this.rest.get(b.name)!); b.rotateX(curl * [0.95, 1.2, 0.8][j] * (f === 'Thumb' ? 0.55 : 1)) }
      })
    })
  }

  private aim(bone: THREE.Bone, child: THREE.Bone, dirWorld: THREE.Vector3) {
    const p = bone.getWorldPosition(new THREE.Vector3())
    const cur = child.getWorldPosition(new THREE.Vector3()).sub(p).normalize()
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, dirWorld)
    const boneWorldQ = bone.getWorldQuaternion(new THREE.Quaternion())
    const parentWorldQ = (bone.parent as THREE.Object3D).getWorldQuaternion(new THREE.Quaternion())
    bone.quaternion.copy(parentWorldQ.invert().multiply(delta).multiply(boneWorldQ))
  }

  headPosition(): THREE.Vector3 {
    const h = this.bones.get('Head')
    return h ? h.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.7, 0)
  }
}
