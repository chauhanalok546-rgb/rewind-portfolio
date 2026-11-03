import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type Expression = 'neutral' | 'happy' | 'serious' | 'proud'

/** morph weights for each mood (ARKit names). Neutral is deliberately warm: a calm, slightly lifted face. */
const EXPRESSIONS: Record<Expression, Record<string, number>> = {
  neutral: { mouthSmileLeft: 0.14, mouthSmileRight: 0.14, cheekSquintLeft: 0.04, cheekSquintRight: 0.04, browOuterUpLeft: 0.12, browOuterUpRight: 0.12 },
  happy: { mouthSmileLeft: 0.42, mouthSmileRight: 0.42, cheekSquintLeft: 0.2, cheekSquintRight: 0.2, browOuterUpLeft: 0.12, browOuterUpRight: 0.12, eyeSquintLeft: 0.1, eyeSquintRight: 0.1 },
  serious: { browDownLeft: 0.22, browDownRight: 0.22, mouthPressLeft: 0.12, mouthPressRight: 0.12, mouthFrownLeft: 0.06, mouthFrownRight: 0.06 },
  proud: { mouthSmileLeft: 0.2, mouthSmileRight: 0.2, browOuterUpLeft: 0.2, browOuterUpRight: 0.2, cheekSquintLeft: 0.06, cheekSquintRight: 0.06 },
}

export type Gesture = 'wave' | 'namaste' | 'snap' | 'thumbs_up' | 'talk1' | 'talk2' | 'present' | 'point'

type V3 = [number, number, number]
interface ArmPose { arm: V3; fore: V3; hand?: V3; fingers?: number[] }   // fingers: thumb, index, middle, ring, pinky curl 0..1
interface GesturePose { L?: ArmPose; R?: ArmPose }
interface GestureDef { dur: number; fadeIn: number; fadeOut: number; amp: number; pose: (t: number) => GesturePose }

const REST_ARM: ArmPose = { arm: [0.12, -1, 0.02], fore: [0.10, -1, 0.22], fingers: [0.15, 0.2, 0.2, 0.2, 0.2] }
const osc = (t: number, hz: number) => Math.sin(t * Math.PI * 2 * hz)
const GESTURES: Record<Gesture, GestureDef> = {
  wave: { dur: 2.8, fadeIn: 0.6, fadeOut: 0.7, amp: 1, pose: (t) => ({ R: { arm: [1, 0.30, 0.05], fore: [0.15 + osc(t, 2.2) * 0.5, 1, 0.08], fingers: [0, 0, 0, 0, 0] } }) },
  namaste: { dur: 3.0, fadeIn: 0.7, fadeOut: 0.8, amp: 1, pose: () => ({
    L: { arm: [0.18, -0.9, 0.32], fore: [-0.55, 0.5, 0.68], fingers: [0, 0, 0, 0, 0] },
    R: { arm: [0.18, -0.9, 0.32], fore: [-0.55, 0.5, 0.68], fingers: [0, 0, 0, 0, 0] } }) },
  snap: { dur: 1.7, fadeIn: 0.45, fadeOut: 0.55, amp: 1, pose: (t) => {
    const flick = t > 0.8 && t < 0.92 ? 1 : 0                       // middle finger slips off the thumb
    const press = t < 0.8 ? Math.min(1, t / 0.5) : 0
    return { R: { arm: [0.28, -0.75, 0.55], fore: [-0.1, 0.78, 0.6], fingers: [0.3 + press * 0.3, 0.9, 0.9 * press + 0.5 * (1 - press) - flick * 0.9, 0.9, 0.9] } }
  } },
  thumbs_up: { dur: 2.2, fadeIn: 0.55, fadeOut: 0.6, amp: 1, pose: () => ({ R: { arm: [0.3, -0.8, 0.5], fore: [0.12, 0.55, 0.85], fingers: [0, 1, 1, 1, 1] } }) },
  talk1: { dur: 2.6, fadeIn: 0.7, fadeOut: 0.9, amp: 0.6, pose: (t) => ({ R: { arm: [0.38, -0.85, 0.4], fore: [0.2 + osc(t, 0.55) * 0.12, 0.2 + osc(t, 1.1) * 0.1, 1], fingers: [0.15, 0.2, 0.25, 0.3, 0.3] } }) },
  talk2: { dur: 3.0, fadeIn: 0.7, fadeOut: 0.9, amp: 0.55, pose: (t) => ({
    L: { arm: [0.45, -0.8, 0.4], fore: [0.3, 0.15 + osc(t, 0.8) * 0.1, 1], fingers: [0.1, 0.15, 0.2, 0.25, 0.3] },
    R: { arm: [0.45, -0.8, 0.4], fore: [0.3, 0.15 + osc(t + 0.3, 0.8) * 0.1, 1], fingers: [0.1, 0.15, 0.2, 0.25, 0.3] } }) },
  present: { dur: 2.6, fadeIn: 0.7, fadeOut: 0.9, amp: 0.65, pose: () => ({ R: { arm: [0.6, -0.7, 0.4], fore: [0.55, 0.2, 0.8], fingers: [0.05, 0.05, 0.05, 0.05, 0.05] } }) },
  point: { dur: 2.4, fadeIn: 0.55, fadeOut: 0.65, amp: 1, pose: () => ({ R: { arm: [1, -0.15, 0.25], fore: [1, 0.0, 0.3], fingers: [0.6, 0, 1, 1, 1] } }) },
}
const easeInOut = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }

export interface VisemeCue { t: number; d: number; v: string }

const MAX_YAW = THREE.MathUtils.degToRad(35)
const MAX_PITCH = THREE.MathUtils.degToRad(15)
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))

/** Critically damped spring (Unity-style SmoothDamp): no overshoot, no jerk when the target jumps. */
class Smooth {
  v = 0
  x: number
  constructor(x = 0) { this.x = x }
  step(target: number, smoothTime: number, dt: number) {
    const w = 2 / Math.max(0.0001, smoothTime)
    const e = Math.exp(-w * dt)
    const d = this.x - target
    const t = (this.v + w * d) * dt
    this.v = (this.v - w * t) * e
    this.x = target + (d + t) * e
    return this.x
  }
}

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
const CURL_SEG = [0.95, 1.2, 0.8]

/** Loads avatar.glb and drives idle life, blinking, eye/head look-at, expressions, gestures and viseme lip-sync. */
export class Avatar {
  readonly root = new THREE.Group()
  private morphMeshes: THREE.Mesh[] = []
  private bones = new Map<string, THREE.Bone>()
  private rest = new Map<string, THREE.Quaternion>()

  // morphs: one flat array per frame, no allocations
  private morphNames: string[] = []
  private morphIndex = new Map<string, number>()
  private morphSlots: Array<Array<[THREE.Mesh, number]>> = []
  private values = new Float32Array(0)
  private wanted = new Float32Array(0)
  private exprNow = new Float32Array(0)
  private exprTarget = new Float32Array(0)

  // look-at
  private target = new THREE.Vector2()
  private headX = new Smooth(); private headY = new Smooth()
  private eyeX = new Smooth(); private eyeY = new Smooth()
  private saccX = 0; private saccY = 0; private saccadeT = 1

  private nextBlink = 1.5
  private blinkT = -1
  private doubleBlink = false
  private clock = 0
  private weightShift = new Smooth(); private weightShiftTarget = 0; private weightT = 6
  private expr: Expression = 'neutral'
  private gesture?: { def: GestureDef; t: number; name: Gesture; fired: boolean }
  private gestureBlend = 0
  private nextTalkGesture = 2.5
  private cueIdx = 0
  private mouth = 0                       // smoothed overall speech amount, drives the head's talking motion

  cues: VisemeCue[] = []
  audio?: HTMLAudioElement
  private ctx?: AudioContext
  private analyser?: AnalyserNode
  private td = new Float32Array(1024)
  private fd = new Uint8Array(512)
  private analyserMode = false
  private level = 0
  private dip = 0
  /** Fired at key moments of a gesture (e.g. 'snap' when the fingers slip, for the sound and the white flash). */
  onEvent?: (name: 'snap') => void

  // scratch objects (reused every frame)
  private _q = new THREE.Quaternion(); private _e = new THREE.Euler()
  private _v1 = new THREE.Vector3(); private _v2 = new THREE.Vector3(); private _v3 = new THREE.Vector3()
  private _pw = new THREE.Quaternion(); private _bw = new THREE.Quaternion(); private _delta = new THREE.Quaternion()
  private bn: Record<string, THREE.Bone | undefined> = {}

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
    for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftEye', 'RightEye', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']) this.bn[n] = this.bones.get(n)
    this.relaxArms()
    // morph lookup tables
    for (const m of this.morphMeshes) for (const name of Object.keys(m.morphTargetDictionary!)) {
      if (!this.morphIndex.has(name)) { this.morphIndex.set(name, this.morphNames.length); this.morphNames.push(name); this.morphSlots.push([]) }
      this.morphSlots[this.morphIndex.get(name)!].push([m, m.morphTargetDictionary![name]])
    }
    const N = this.morphNames.length
    this.values = new Float32Array(N); this.wanted = new Float32Array(N); this.exprNow = new Float32Array(N); this.exprTarget = new Float32Array(N)
    this.setExpression(this.expr)
    return this
  }

  get morphCount() { return this.morphNames.length }

  /** The export is in a T-pose: bring the arms down to a relaxed stance. */
  private relaxArms() {
    this.root.updateMatrixWorld(true)
    for (const side of ['Left', 'Right']) {
      const arm = this.bones.get(`${side}Arm`), fore = this.bones.get(`${side}ForeArm`), hand = this.bones.get(`${side}Hand`)
      if (!arm || !fore) continue
      const out = side === 'Left' ? 1 : -1
      this.aim(arm, fore, new THREE.Vector3(out * 0.12, -1, 0.02).normalize()); this.rest.set(arm.name, arm.quaternion.clone())
      this.root.updateMatrixWorld(true)
      if (hand) { this.aim(fore, hand, new THREE.Vector3(out * 0.10, -1, 0.22).normalize()); this.rest.set(fore.name, fore.quaternion.clone()) }
      this.root.updateMatrixWorld(true)
    }
  }

  play(g: Gesture) { this.gesture = { def: GESTURES[g], t: 0, name: g, fired: false } }
  get gestureActive() { return !!this.gesture }
  setExpression(e: Expression) {
    this.expr = e
    this.exprTarget.fill(0)
    for (const n in EXPRESSIONS[e]) { const i = this.morphIndex.get(n); if (i !== undefined) this.exprTarget[i] = EXPRESSIONS[e][n] }
  }
  setLookTarget(x: number, y: number) { this.target.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)) }
  blinkNow() { if (this.blinkT < 0) this.blinkT = 0 }

  isSpeaking() { return !!(this.audio && !this.audio.paused && !this.audio.ended && (this.analyserMode || this.cues.length)) }

  stop() { this.audio?.pause(); this.cues = []; this.analyserMode = false }

  /** Plays any audio and lip-syncs it from the sound itself (loudness drives the jaw, brightness picks the mouth shape). */
  speakAudio(audioUrl: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.audio?.pause()
      this.cues = []
      const el = new Audio(audioUrl)
      el.crossOrigin = 'anonymous'
      this.audio = el
      this.analyserMode = true
      this.ensureAudioGraph(el)
      const done = () => { if (this.audio === el) this.analyserMode = false; resolve() }
      el.onended = done; el.onerror = done
      el.play().catch(done)
    })
  }

  private ensureAudioGraph(el: HTMLAudioElement) {
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (!this.analyser) { this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.35 }
    const src = this.ctx.createMediaElementSource(el)
    src.connect(this.analyser); this.analyser.connect(this.ctx.destination)
  }

  async speak(audioUrl: string, cuesUrl: string, onEnd?: () => void) {
    const data = await (await fetch(cuesUrl)).json()
    this.cues = data.cues; this.cueIdx = 0
    this.audio?.pause()
    this.audio = new Audio(audioUrl)
    this.audio.onended = () => { this.cues = []; onEnd?.() }
    await this.audio.play()
  }

  private want(name: string, v: number) {
    const i = this.morphIndex.get(name)
    if (i !== undefined && v > this.wanted[i]) this.wanted[i] = v
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05)
    this.clock += dt
    const t = this.clock
    this.wanted.fill(0)
    const speaking = this.isSpeaking()
    this.mouth = damp(this.mouth, speaking ? 1 : 0, 4, dt)

    // ---- body life: breathing drives chest, shoulders and a hint of head; weight shift on the hips
    const breath = Math.sin(t * 1.55) * 0.5 + 0.5                // 0..1
    this.layer('Spine', 0, Math.sin(t * 0.33) * 0.012, Math.sin(t * 0.21 + 1) * 0.006)
    this.layer('Spine1', breath * 0.006, 0, 0)
    this.layer('Spine2', breath * 0.011, Math.sin(t * 0.33 + 0.5) * -0.008, Math.sin(t * 0.5) * 0.004)
    this.layer('LeftShoulder', 0, 0, breath * 0.012)
    this.layer('RightShoulder', 0, 0, -breath * 0.012)
    this.weightT -= dt
    if (this.weightT <= 0) { this.weightT = 6 + Math.random() * 4; this.weightShiftTarget = (Math.random() < 0.5 ? -1 : 1) * 0.011 }
    this.layer('Hips', Math.sin(t * 0.27) * 0.004, 0, this.weightShift.step(this.weightShiftTarget, 1.1, dt))

    this.updateGesture(dt, speaking)
    if (this.gestureBlend <= 0 && !this.gesture) {
      // relaxed arms are never dead still: a very small pendulum
      this.layer('LeftArm', Math.sin(t * 0.9) * 0.012, 0, Math.sin(t * 0.7 + 1) * 0.008)
      this.layer('RightArm', Math.sin(t * 0.9 + 1.4) * 0.012, 0, Math.sin(t * 0.7) * 0.008)
      this.layer('LeftForeArm', Math.sin(t * 0.8 + 0.4) * 0.01, 0, 0)
      this.layer('RightForeArm', Math.sin(t * 0.8 + 1.9) * 0.01, 0, 0)
    }

    // ---- look-at: eyes arrive first, the head follows with a lag; saccades are smoothed, never snapped
    this.saccadeT -= dt
    if (this.saccadeT <= 0) {
      this.saccadeT = 0.6 + Math.random() * 1.8
      const still = Math.random() < 0.4
      this.saccX = still ? 0 : (Math.random() - 0.5) * 0.16
      this.saccY = still ? 0 : (Math.random() - 0.5) * 0.10
    }
    const driftX = Math.sin(t * 0.41) * 0.03 + Math.sin(t * 0.93) * 0.012
    const driftY = Math.sin(t * 0.53 + 1) * 0.02
    const ex = this.eyeX.step(this.target.x, 0.14, dt), ey = this.eyeY.step(this.target.y, 0.14, dt)
    const hx = this.headX.step(this.target.x, 0.42, dt), hy = this.headY.step(this.target.y, 0.46, dt)
    const yaw = (hx + driftX) * MAX_YAW
    const pitch = -(hy + driftY) * MAX_PITCH
    const nod = this.mouth * (Math.sin(t * 2.3) * 0.018 + Math.sin(t * 4.7) * 0.007)
    const tilt = Math.sin(t * 0.37) * 0.015 + this.mouth * Math.sin(t * 1.9) * 0.012
    this.look('Neck', yaw * 0.35, pitch * 0.35 + nod * 0.4, tilt * 0.4)
    this.look('Head', yaw * 0.65, pitch * 0.65 + nod * 0.6, tilt * 0.6)
    const eyeYaw = (ex - hx * 0.6 + this.saccX) * MAX_YAW * 0.55
    const eyePitch = -(ey - hy * 0.6 + this.saccY) * MAX_PITCH * 0.8
    this.look('LeftEye', eyeYaw, eyePitch, 0); this.look('RightEye', eyeYaw, eyePitch, 0)

    // ---- blinking: 120-180 ms, every 2-6 s, occasional double blink
    if (this.blinkT < 0) {
      this.nextBlink -= dt
      if (this.nextBlink <= 0) { this.blinkT = 0; this.doubleBlink = Math.random() < 0.15 }
    } else {
      this.blinkT += dt
      const dur = 0.16, k = this.blinkT / dur
      const w = k < 0.38 ? k / 0.38 : Math.max(0, 1 - (k - 0.38) / 0.62)
      this.want('eyeBlinkLeft', w); this.want('eyeBlinkRight', w)
      if (this.blinkT >= dur) { this.blinkT = -1; this.nextBlink = this.doubleBlink ? 0.14 : 2 + Math.random() * 4; this.doubleBlink = false }
    }

    // ---- mood (blended smoothly) + a touch of brow life
    for (let i = 0; i < this.exprNow.length; i++) {
      const v = damp(this.exprNow[i], this.exprTarget[i], 3.2, dt)
      this.exprNow[i] = v
      if (v > 0.002) { const w = v * (1 - 0.35 * this.mouth); if (w > this.wanted[i]) this.wanted[i] = w }
    }
    this.want('browOuterUpLeft', 0.12 + 0.05 * Math.sin(t * 0.7))
    this.want('browOuterUpRight', 0.12 + 0.05 * Math.sin(t * 0.7 + 0.6))
    const lookDown = hy + driftY
    if (lookDown < -0.2) { const k = Math.min(0.3, -lookDown * 0.35); this.want('eyeBlinkLeft', k); this.want('eyeBlinkRight', k) }

    // ---- audio-driven lip-sync (works for any voice, including live answers later)
    if (this.analyserMode && this.analyser && speaking) {
      this.analyser.getFloatTimeDomainData(this.td)
      let sum = 0
      for (let i = 0; i < this.td.length; i++) sum += this.td[i] * this.td[i]
      const rms = Math.sqrt(sum / this.td.length)
      this.analyser.getByteFrequencyData(this.fd)
      let num = 0, den = 0
      const hzPerBin = this.ctx!.sampleRate / this.analyser.fftSize
      const maxBin = Math.min(this.fd.length, Math.floor(7000 / hzPerBin))          // speech energy lives below ~7 kHz
      for (let i = 2; i < maxBin; i++) { const w = Math.max(0, this.fd[i] - 70); num += i * w; den += w }   // ignore the noise floor
      const centroid = den > 0 ? (num / den) * hzPerBin : 0
      const open = Math.min(1, Math.max(0, (rms - 0.02) / 0.3)) ** 0.85
      this.level = damp(this.level, open, open > this.level ? 28 : 14, dt)        // quick attack, softer release
      const o = this.level
      if (centroid < 1500) { this.want('viseme_O', o * 0.6); this.want('viseme_U', o * 0.22) }
      else if (centroid < 2700) { this.want('viseme_aa', o * 0.65); this.want('viseme_E', o * 0.2) }
      else { this.want('viseme_I', o * 0.35); this.want('viseme_SS', o * 0.3) }
      // lips press together on sudden dips between words
      this.dip = damp(this.dip, o < 0.06 ? 1 : 0, 10, dt)
      this.want('viseme_PP', this.dip * 0.3 * (this.level > 0 ? 1 : 0))
    } else this.level = damp(this.level, 0, 12, dt)

    // ---- lip-sync: the current cue is held (no per-cue pulsing), mouth closes in silences
    if (this.audio && this.cues.length) {
      const at = this.audio.currentTime
      while (this.cueIdx > 0 && at < this.cues[this.cueIdx].t) this.cueIdx--
      while (this.cueIdx < this.cues.length - 1 && at >= this.cues[this.cueIdx].t + this.cues[this.cueIdx].d) this.cueIdx++
      const cue = this.cues[this.cueIdx]
      if (cue && at >= cue.t && at < cue.t + cue.d && cue.v !== 'viseme_sil') {
        const vowel = /aa|E|I|O|U/.test(cue.v)
        this.want(cue.v, vowel ? 0.72 : 0.5)
      }
    }

    // ---- apply with per-channel smoothing
    for (let i = 0; i < this.values.length; i++) {
      const name = this.morphNames[i]
      const rate = name.startsWith('eyeBlink') ? 38 : name.startsWith('viseme_') ? 16 : 10
      const v = damp(this.values[i], this.wanted[i], rate, dt)
      this.values[i] = v
      for (const [m, idx] of this.morphSlots[i]) m.morphTargetInfluences![idx] = v
    }
  }

  /** rest * small Euler offset, no allocation */
  private layer(name: string, x: number, y: number, z: number) {
    const b = this.bn[name]; const r = this.rest.get(name)
    if (!b || !r) return
    this._e.set(x, y, z, 'XYZ'); this._q.setFromEuler(this._e)
    b.quaternion.copy(r).multiply(this._q)
  }
  private look(name: string, yaw: number, pitch: number, roll: number) {
    const b = this.bn[name]; const r = this.rest.get(name)
    if (!b || !r) return
    this._e.set(pitch, yaw, roll, 'YXZ'); this._q.setFromEuler(this._e)
    b.quaternion.copy(r).multiply(this._q)
  }

  /** Poses the arms/hands for the active gesture (eased in/out); bones are reset to the relaxed rest first. */
  private updateGesture(dt: number, speaking: boolean) {
    if (speaking && !this.gesture) {                       // an unhurried talking gesture every few seconds
      this.nextTalkGesture -= dt
      if (this.nextTalkGesture <= 0) {
        this.nextTalkGesture = 3 + Math.random() * 3
        this.play((['talk1', 'talk2', 'present'] as Gesture[])[Math.floor(Math.random() * 3)])
      }
    }
    let w = 0
    let pose: GesturePose = {}
    if (this.gesture) {
      const g = this.gesture
      g.t += dt
      const { def, t } = g
      if (g.name === 'snap' && !g.fired && t >= 0.8) { g.fired = true; this.onEvent?.('snap') }
      if (t >= def.dur) this.gesture = undefined
      else { w = easeInOut(t / def.fadeIn) * easeInOut((def.dur - t) / def.fadeOut) * def.amp; pose = def.pose(t) }
    }
    if (w <= 0 && this.gestureBlend <= 0) return
    this.gestureBlend = w
    for (const side of ['Left', 'Right'] as const) {
      const target = pose[side === 'Left' ? 'L' : 'R']
      this.poseArm(side, target ?? REST_ARM, target ? w : 0)
    }
  }

  private mix(out: THREE.Vector3, a: V3, b: V3, sgn: number, w: number) {
    this._v2.set(a[0] * sgn, a[1], a[2]).normalize()
    this._v3.set(b[0] * sgn, b[1], b[2]).normalize()
    return out.copy(this._v2).lerp(this._v3, w).normalize()
  }

  private poseArm(side: 'Left' | 'Right', p: ArmPose, w: number) {
    const sgn = side === 'Left' ? 1 : -1
    const arm = this.bones.get(side + 'Arm'), fore = this.bones.get(side + 'ForeArm'), hand = this.bones.get(side + 'Hand')
    if (!arm || !fore || !hand) return
    for (const b of [arm, fore, hand]) b.quaternion.copy(this.rest.get(b.name)!)
    arm.updateWorldMatrix(false, true)
    const dir = this._v1
    this.aim(arm, fore, this.mix(dir, REST_ARM.arm, p.arm, sgn, w)); arm.updateWorldMatrix(false, true)
    this.aim(fore, hand, this.mix(dir, REST_ARM.fore, p.fore, sgn, w)); fore.updateWorldMatrix(false, true)
    const base = REST_ARM.fingers!, tgt = p.fingers ?? base
    for (let i = 0; i < 5; i++) {
      const curl = base[i] + (tgt[i] - base[i]) * w
      for (let j = 0; j < 3; j++) {
        const b = this.bones.get(side + 'Hand' + FINGERS[i] + (j + 1))
        if (b) { b.quaternion.copy(this.rest.get(b.name)!); b.rotateX(curl * CURL_SEG[j] * (i === 0 ? 0.55 : 1)) }
      }
    }
  }

  /** Rotate `bone` (in world space) so that the line bone -> child points along dirWorld. */
  private aim(bone: THREE.Bone, child: THREE.Bone, dirWorld: THREE.Vector3) {
    bone.getWorldPosition(this._v2)
    child.getWorldPosition(this._v3)
    this._v3.sub(this._v2).normalize()
    this._delta.setFromUnitVectors(this._v3, dirWorld)
    bone.getWorldQuaternion(this._bw)
    ;(bone.parent as THREE.Object3D).getWorldQuaternion(this._pw)
    bone.quaternion.copy(this._pw.invert().multiply(this._delta).multiply(this._bw))
  }

  headPosition(): THREE.Vector3 {
    const h = this.bones.get('Head')
    return h ? h.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.7, 0)
  }
}
