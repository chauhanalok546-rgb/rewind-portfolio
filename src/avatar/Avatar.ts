import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { audioGraph } from '../audio/sfx'

export type Expression = 'neutral' | 'happy' | 'serious' | 'proud'

/** morph weights for each mood (ARKit names). Neutral is deliberately warm: a calm, slightly lifted face. */
const EXPRESSIONS: Record<Expression, Record<string, number>> = {
  neutral: { mouthSmileLeft: 0.14, mouthSmileRight: 0.14, cheekSquintLeft: 0.04, cheekSquintRight: 0.04, browOuterUpLeft: 0.12, browOuterUpRight: 0.12 },
  happy: { mouthSmileLeft: 0.42, mouthSmileRight: 0.42, cheekSquintLeft: 0.2, cheekSquintRight: 0.2, browOuterUpLeft: 0.12, browOuterUpRight: 0.12, eyeSquintLeft: 0.1, eyeSquintRight: 0.1 },
  serious: { browDownLeft: 0.22, browDownRight: 0.22, mouthPressLeft: 0.12, mouthPressRight: 0.12, mouthFrownLeft: 0.06, mouthFrownRight: 0.06 },
  proud: { mouthSmileLeft: 0.2, mouthSmileRight: 0.2, browOuterUpLeft: 0.2, browOuterUpRight: 0.2, cheekSquintLeft: 0.06, cheekSquintRight: 0.06 },
}

export type Gesture = 'wave' | 'namaste' | 'snap' | 'thumbs_up' | 'talk1' | 'talk2' | 'present' | 'point' | 'beat' | 'beatL' | 'open' | 'think'

type V3 = [number, number, number]
interface ArmPose { arm: V3; fore: V3; hand?: V3; fingers?: number[] }   // fingers: thumb, index, middle, ring, pinky curl 0..1
interface GesturePose { L?: ArmPose; R?: ArmPose }
interface GestureDef { dur: number; fadeIn: number; fadeOut: number; amp: number; pose: (t: number) => GesturePose }

const REST_ARM: ArmPose = { arm: [0.15, -1, 0.07], fore: [0.09, -0.93, 0.38], fingers: [0.18, 0.30, 0.36, 0.42, 0.46] }   // a natural, slightly bent, relaxed stance
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
  beat: { dur: 1.5, fadeIn: 0.35, fadeOut: 0.5, amp: 0.7, pose: (t) => ({ R: { arm: [0.42, -0.8, 0.42], fore: [0.3, 0.1 + Math.max(0, osc(t, 1.4)) * 0.35, 0.95], fingers: [0.1, 0.12, 0.2, 0.25, 0.3] } }) },
  beatL: { dur: 1.5, fadeIn: 0.35, fadeOut: 0.5, amp: 0.7, pose: (t) => ({ L: { arm: [0.42, -0.8, 0.42], fore: [0.3, 0.1 + Math.max(0, osc(t, 1.4)) * 0.35, 0.95], fingers: [0.1, 0.12, 0.2, 0.25, 0.3] } }) },
  open: { dur: 2.4, fadeIn: 0.5, fadeOut: 0.7, amp: 0.7, pose: (t) => ({
    L: { arm: [0.62, -0.7, 0.3], fore: [0.7, 0.2 + osc(t, 0.6) * 0.08, 0.7], fingers: [0.05, 0.08, 0.08, 0.1, 0.1] },
    R: { arm: [0.62, -0.7, 0.3], fore: [0.7, 0.2 + osc(t + 0.2, 0.6) * 0.08, 0.7], fingers: [0.05, 0.08, 0.08, 0.1, 0.1] } }) },
  think: { dur: 2.6, fadeIn: 0.6, fadeOut: 0.8, amp: 0.8, pose: () => ({ R: { arm: [0.3, -0.7, 0.62], fore: [-0.2, 0.9, 0.5], fingers: [0.3, 0.7, 0.6, 0.6, 0.6] } }) },
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
  private blinkDur = 0.16
  private doubleBlink = false
  private clock = 0
  private weightShift = new Smooth(); private weightShiftTarget = 0; private weightT = 6
  private expr: Expression = 'neutral'
  private gesture?: { def: GestureDef; t: number; name: Gesture; fired: boolean }
  private gestureBlend = 0
  private nextTalkGesture = 2.5
  private cueIdx = 0
  private mouth = 0                       // smoothed overall speech amount, drives the head's talking motion

  // ---- autonomy: the twin lives on its own (wanders, glances around, gestures) until it is asked to speak
  private auto = { on: false, nextAct: 6, walking: false, settle: false, tx: 0, tz: 0, phase: 0, blend: 0, nextLook: 4, lookUntil: 0, lx: 0, ly: 0 }
  private lastPointer = 0
  /** tuning for the procedural gait (signs depend on the skeleton's axes) */
  gait = { thigh: 1, knee: 1, arm: 1, swing: 0.5, speed: 0.5 }
  get isAutonomous() { return this.auto.on }
  /** pause the line that is playing (keeps its place) so something else can speak; resumeSpeech continues it exactly where it stopped */
  holdSpeech() {
    const el = this.audio
    if (!el || el.paused || el.ended) return null
    el.pause(); this.analyserMode = false
    return { el, cues: this.cues, idx: this.cueIdx }
  }
  resumeSpeech(s: { el: HTMLAudioElement; cues: VisemeCue[]; idx: number } | null) {
    if (!s) return
    this.audio = s.el; this.cues = s.cues; this.cueIdx = s.idx; this.analyserMode = true
    void s.el.play().catch(() => undefined)
  }
  setAutonomous(on: boolean) { this.auto.on = on; if (!on) this.stopWalk() }
  walkTo(x: number, z: number) { this.auto.tx = x; this.auto.tz = z; this.auto.walking = true; this.auto.settle = true }
  stopWalk() { this.auto.walking = false }
  get walking() { return this.auto.walking }

  cues: VisemeCue[] = []
  audio?: HTMLAudioElement
  /** spring-damped hair: six hair bones lag behind head turns and settle with a little overshoot (off on weak devices) */
  hairPhysics = true
  private hair: Array<{ bone: THREE.Bone; angle: number; d: THREE.Vector3; v: THREE.Vector3 }> = []
  private prevHead = { yaw: 0, pitch: 0, roll: 0, init: false }
  private ctx?: AudioContext
  private analyser?: AnalyserNode
  private td = new Float32Array(1024)
  private fd = new Uint8Array(512)
  private analyserMode = false
  private muted = false
  private level = 0
  private dip = 0
  /** Fired at key moments of a gesture (e.g. 'snap' when the fingers slip, for the sound and the white flash). */
  onEvent?: (name: 'snap') => void

  // scratch objects (reused every frame)
  private _q = new THREE.Quaternion(); private _e = new THREE.Euler()
  private _v1 = new THREE.Vector3(); private _v2 = new THREE.Vector3(); private _v3 = new THREE.Vector3()
  private _pw = new THREE.Quaternion(); private _bw = new THREE.Quaternion(); private _delta = new THREE.Quaternion()
  private bn: Record<string, THREE.Bone | undefined> = {}

  async load(url: string, onProgress?: (fraction: number) => void) {
    const gltf = await new GLTFLoader().loadAsync(url, (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) })
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
    this.finishLook(gltf.scene)
    for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftEye', 'RightEye', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']) this.bn[n] = this.bones.get(n)
    for (const [n, b] of this.bones) {
      const m = /^Hair(Front|BackL|BackR|Back|L|R)$/.exec(n)
      if (m) this.hair.push({ bone: b, angle: { Front: 0, R: 90, BackR: 135, Back: 180, BackL: -135, L: -90 }[m[1] as 'Front'] * Math.PI / 180, d: new THREE.Vector3(), v: new THREE.Vector3() })
    }
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

  /** Realism touches that do not need new art: warm skin undertone, hair sheen, wet-looking eyes, a soft contact shadow. */
  private finishLook(scene: THREE.Object3D) {
    let body: THREE.Mesh | undefined
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mat = m.material as THREE.MeshStandardMaterial
      if (o.name === 'avaturn_body' && mat.map) {
        body = m
        mat.emissive = new THREE.Color('#ff7e5c'); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.12   // blood-warm undertone, so skin never goes grey in shadow
        mat.envMapIntensity = 1.15
        // openings for the 3D eyes: a black-and-white mask (made in Blender with the same UVs) cuts the skin away over each eye
        if (scene.getObjectByName('LeftEye_sclera')) {            // only for the avatar variant that has real 3D eyes
          const mask = new THREE.TextureLoader().load('/textures/eye_mask.png'); mask.flipY = false
          mat.alphaMap = mask; mat.alphaTest = 0.5; mat.needsUpdate = true
        }
      }
      if (o.name.startsWith('avaturn_hair')) { mat.roughness = 0.5; mat.envMapIntensity = 1.4 }
    })
    // soft contact shadow under the feet
    const c = document.createElement('canvas'); c.width = c.height = 128
    const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64)
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.006, 0.02); shadow.renderOrder = -1; this.root.add(shadow)
    // glossy corneas: a black, specular-only cap over each painted eye (additive), carried by the eye bones so the glints move with the gaze
    if (body) this.addCorneas(body)
  }

  private corneas: THREE.Mesh[] = []
  private addCorneas(body: THREE.Mesh) {
    this.root.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(); const mat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.05, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.04, envMapIntensity: 0.55, specularIntensity: 0.6, opacity: 0.8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    for (const name of ['LeftEye', 'RightEye']) {
      const eye = this.bones.get(name); if (!eye) continue
      const p = eye.getWorldPosition(new THREE.Vector3())
      ray.set(new THREE.Vector3(p.x, p.y, 1), new THREE.Vector3(0, 0, -1))
      const hit = ray.intersectObject(body, false)[0]; if (!hit) continue
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0108, 28, 18), mat)
      cap.scale.set(1, 1, 0.3); cap.renderOrder = 5; cap.frustumCulled = false
      cap.position.copy(eye.worldToLocal(new THREE.Vector3(p.x, p.y, hit.point.z + 0.0008)))
      cap.userData.base = cap.scale.clone(); cap.userData.side = name; eye.add(cap); this.corneas.push(cap)
    }
  }

  get morphCount() { return this.morphNames.length }

  /** The export is in a T-pose: bring the arms down to a relaxed stance. */
  private relaxArms() {
    this.root.updateMatrixWorld(true)
    for (const side of ['Left', 'Right']) {
      const arm = this.bones.get(`${side}Arm`), fore = this.bones.get(`${side}ForeArm`), hand = this.bones.get(`${side}Hand`)
      if (!arm || !fore) continue
      const out = side === 'Left' ? 1 : -1
      this.aim(arm, fore, new THREE.Vector3(out * REST_ARM.arm[0], REST_ARM.arm[1], REST_ARM.arm[2]).normalize()); this.rest.set(arm.name, arm.quaternion.clone())
      this.root.updateMatrixWorld(true)
      if (hand) { this.aim(fore, hand, new THREE.Vector3(out * REST_ARM.fore[0], REST_ARM.fore[1], REST_ARM.fore[2]).normalize()); this.rest.set(fore.name, fore.quaternion.clone()) }
      this.root.updateMatrixWorld(true)
      // relaxed, gently curled fingers at rest (progressively more towards the little finger)
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        const b = this.bones.get(`${side}Hand${FINGERS[i]}${j + 1}`)
        if (b) { b.rotateX(REST_ARM.fingers![i] * CURL_SEG[j] * (i === 0 ? 0.55 : 1)); this.rest.set(b.name, b.quaternion.clone()) }
      }
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
  private lockUntil = 0
  /** Eyes and head turn to the visitor (the camera) and ignore the mouse pointer for a while. */
  lookAtVisitor(x: number, y: number, ms = 6000) { this.lockUntil = performance.now() + ms; this.target.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)) }
  setLookTarget(x: number, y: number) { this.lastPointer = performance.now(); if (performance.now() < this.lockUntil) return; this.target.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)) }
  blinkNow(duration = 0.16) { if (this.blinkT < 0) { this.blinkT = 0; this.blinkDur = duration } }

  /** browser speech voice has no audio to analyse: a simple syllable-rate jaw flap stands in */
  flapping = false
  isSpeaking() { return this.flapping || !!(this.audio && !this.audio.paused && !this.audio.ended && (this.analyserMode || this.cues.length)) }

  setMuted(m: boolean) { this.muted = m; if (this.audio) this.audio.muted = m }

  private epoch = 0                  // bumped by every new utterance and by stop(): a clip still fetching its cues when this changes never starts
  stop() { this.epoch++; this.audio?.pause(); this.cues = []; this.analyserMode = false }

  /** Plays any audio and lip-syncs it from the sound itself (loudness drives the jaw, brightness picks the mouth shape). */
  async speakAudio(audioUrl: string): Promise<void> {
    const ep = ++this.epoch
    // pre-computed mouth-shape cues (from the speech engine's word timings) sit next to every shipped clip: /x/line.mp3 -> /x/cues/line.json
    let cues: VisemeCue[] = []
    if (!audioUrl.startsWith('blob:')) {
      const cuesUrl = audioUrl.replace(/\/([^/]+)\.mp3$/, '/cues/$1.json')
      cues = await Promise.race([fetch(cuesUrl).then((r) => (r.ok ? r.json() : null)).then((j) => (j?.cues ?? []) as VisemeCue[]).catch(() => [] as VisemeCue[]), new Promise<VisemeCue[]>((r) => setTimeout(() => r([]), 400))])
    }
    if (ep !== this.epoch) return                                              // replaced or stopped while its cues were loading
    return new Promise<void>((resolve) => {
      this.audio?.pause()
      this.cues = cues; this.cueIdx = 0
      const el = new Audio(audioUrl)
      el.crossOrigin = 'anonymous'
      el.muted = this.muted
      this.audio = el
      this.analyserMode = true
      this.ensureAudioGraph(el)
      const done = () => { if (this.audio === el) this.analyserMode = false; resolve() }
      el.onended = done; el.onerror = done
      el.play().catch(done)
    })
  }

  private ensureAudioGraph(el: HTMLAudioElement) {
    this.ctx ??= audioGraph().ctx            // the same context that was unlocked by the Enter click (Safari needs that)
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
    this.layer('Spine2', breath * 0.011, Math.sin(t * 0.33 + 0.5) * -0.008, Math.sin(t * 0.5) * 0.004)
    this.layer('LeftShoulder', 0, 0, breath * 0.012)
    this.layer('RightShoulder', 0, 0, -breath * 0.012)
    this.weightT -= dt
    if (this.weightT <= 0) { this.weightT = 6 + Math.random() * 4; this.weightShiftTarget = (Math.random() < 0.5 ? -1 : 1) * 0.011 }
    const A = this.auto, G = this.gait
    if (A.on && this.root.visible) {
      const free = !speaking && !this.gesture
      if (speaking) A.walking = false
      A.nextAct -= dt
      if (A.nextAct <= 0 && free && !A.walking) {                 // every so often: stroll, glance around or gesture
        A.nextAct = 6 + Math.random() * 7
        const r = Math.random()
        if (r < 0.5) this.walkTo(-0.55 + Math.random() * 0.8, -0.1 + Math.random() * 0.55)
        else if (r < 0.8) this.play((['talk2', 'open', 'beat', 'think', 'present'] as Gesture[])[Math.floor(Math.random() * 5)])
        else A.lookUntil = performance.now() + 2200
      }
      if (A.walking) {
        const dx = A.tx - this.root.position.x, dz = A.tz - this.root.position.z, dist = Math.hypot(dx, dz)
        if (dist < 0.04) A.walking = false
        else {
          const step = Math.min(dist, G.speed * dt)
          this.root.position.x += (dx / dist) * step; this.root.position.z += (dz / dist) * step
          A.phase += dt * G.speed * 7.4
          const want = Math.atan2(dx, dz); let d = want - this.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d))
          this.root.rotation.y += d * (1 - Math.exp(-6 * dt))
        }
      } else if (A.settle) {                                         // arrived: turn back to face the visitor
        let d = -this.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d))
        this.root.rotation.y += d * (1 - Math.exp(-4 * dt))
        if (Math.abs(d) < 0.02) { this.root.rotation.y = 0; A.settle = false }
      }
    } else A.walking = false
    A.blend = damp(A.blend, A.walking ? 1 : 0, 6, dt)
    const wb = A.blend, ws = Math.sin(A.phase), wc = Math.cos(A.phase)
    this.root.position.y = Math.abs(wc) * 0.014 * wb
    this.layer('Hips', Math.sin(t * 0.27) * 0.004 + wb * 0.03, wb * ws * 0.09, this.weightShift.step(this.weightShiftTarget, 1.1, dt) + wb * wc * 0.03)
    this.layer('LeftUpLeg', G.thigh * ws * G.swing * wb, 0, 0); this.layer('RightUpLeg', -G.thigh * ws * G.swing * wb, 0, 0)
    this.layer('LeftLeg', G.knee * Math.max(0, wc) * 0.75 * wb * (ws > 0 ? 1 : 0.3), 0, 0); this.layer('RightLeg', G.knee * Math.max(0, -wc) * 0.75 * wb * (ws < 0 ? 1 : 0.3), 0, 0)
    this.layer('LeftFoot', -G.thigh * ws * G.swing * 0.35 * wb, 0, 0); this.layer('RightFoot', G.thigh * ws * G.swing * 0.35 * wb, 0, 0)
    this.layer('Spine1', breath * 0.006, -wb * ws * 0.07, 0)

    this.updateGesture(dt, speaking)
    if (this.gestureBlend <= 0 && !this.gesture) {
      // relaxed arms are never dead still: a very small pendulum
      const sw = this.gait.arm * this.auto.blend * Math.sin(this.auto.phase) * 0.32
      this.layer('LeftArm', Math.sin(t * 0.9) * 0.012 - sw, 0, Math.sin(t * 0.7 + 1) * 0.008)
      this.layer('RightArm', Math.sin(t * 0.9 + 1.4) * 0.012 + sw, 0, Math.sin(t * 0.7) * 0.008)
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
    if (this.auto.on && performance.now() - this.lastPointer > 3500 && performance.now() > this.lockUntil) {
      if (performance.now() < this.auto.lookUntil) { if (this.auto.ly === 0) { this.auto.lx = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5); this.auto.ly = (Math.random() - 0.3) * 0.5 + 0.001 } this.target.set(this.auto.lx, this.auto.ly) }
      else { this.auto.ly = 0; this.target.set(0, 0.04) }
    }
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
    this.updateHair(dt, yaw * 0.65 + yaw * 0.35, pitch * 0.65 + pitch * 0.35 + nod, tilt)

    // ---- blinking: 120-180 ms, every 2-6 s, occasional double blink
    if (this.blinkT < 0) {
      this.nextBlink -= dt
      if (this.nextBlink <= 0) { this.blinkT = 0; this.doubleBlink = Math.random() < 0.15 }
    } else {
      this.blinkT += dt
      const dur = this.blinkDur, k = this.blinkT / dur
      const w = k < 0.38 ? k / 0.38 : Math.max(0, 1 - (k - 0.38) / 0.62)
      this.want('eyeBlinkLeft', w); this.want('eyeBlinkRight', w)
      if (this.blinkT >= dur) { this.blinkT = -1; this.blinkDur = 0.16; this.nextBlink = this.doubleBlink ? 0.14 : 2 + Math.random() * 4; this.doubleBlink = false }
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
      if (this.cues.length && this.audio) {
        // exact shapes from the word timings (looked up a hair early, since lips lead the sound), opened by how loud the speech really is
        const at = this.audio.currentTime + 0.035
        while (this.cueIdx > 0 && at < this.cues[this.cueIdx].t) this.cueIdx--
        while (this.cueIdx < this.cues.length - 1 && at >= this.cues[this.cueIdx].t + this.cues[this.cueIdx].d) this.cueIdx++
        const cue = this.cues[this.cueIdx]
        if (cue && at >= cue.t && at < cue.t + cue.d) {
          const v = cue.v.slice(7)
          if (/^(aa|E|I|O|U)$/.test(v)) this.want(cue.v, Math.min(1, 0.22 + o * 0.95) * (v === 'aa' ? 0.85 : 0.7))
          else if (v === 'PP') this.want(cue.v, 0.7)                                             // lips fully closed for p, b, m
          else if (v === 'FF' || v === 'TH') this.want(cue.v, 0.6)
          else this.want(cue.v, 0.3 + o * 0.3)
          if (!/^(aa|E|I|O|U|PP)$/.test(v)) this.want('viseme_aa', o * 0.18)                  // a little jaw under the consonants
        } else this.want('viseme_PP', this.level < 0.05 ? 0.12 : 0)                            // between words the lips rest together
      } else {
        if (centroid < 1500) { this.want('viseme_O', o * 0.6); this.want('viseme_U', o * 0.22) }
        else if (centroid < 2700) { this.want('viseme_aa', o * 0.65); this.want('viseme_E', o * 0.2) }
        else { this.want('viseme_I', o * 0.35); this.want('viseme_SS', o * 0.3) }
        // lips press together on sudden dips between words
        this.dip = damp(this.dip, o < 0.06 ? 1 : 0, 10, dt)
        this.want('viseme_PP', this.dip * 0.3 * (this.level > 0 ? 1 : 0))
      }
    } else if (this.flapping) {
      const f = Math.max(0, Math.sin(t * 17) * 0.5 + Math.sin(t * 7.3) * 0.5)
      this.level = damp(this.level, f * 0.7, 20, dt)
      this.want(Math.sin(t * 5.1) > 0 ? 'viseme_aa' : 'viseme_O', this.level * 0.6)
    } else this.level = damp(this.level, 0, 12, dt)

    // ---- lip-sync: the current cue is held (no per-cue pulsing), mouth closes in silences
    if (this.audio && this.cues.length && !this.analyserMode) {
      const at = this.audio.currentTime
      while (this.cueIdx > 0 && at < this.cues[this.cueIdx].t) this.cueIdx--
      while (this.cueIdx < this.cues.length - 1 && at >= this.cues[this.cueIdx].t + this.cues[this.cueIdx].d) this.cueIdx++
      const cue = this.cues[this.cueIdx]
      if (cue && at >= cue.t && at < cue.t + cue.d && cue.v !== 'viseme_sil') {
        const vowel = /aa|E|I|O|U/.test(cue.v)
        this.want(cue.v, vowel ? 0.72 : 0.5)
      }
    }

    // ---- corneas close with the lids
    for (const c of this.corneas) {
      const i = this.morphIndex.get(c.userData.side === 'LeftEye' ? 'eyeBlinkLeft' : 'eyeBlinkRight')
      const b = i === undefined ? 0 : this.values[i]
      c.scale.y = c.userData.base.y * Math.max(0.04, 1 - b * 1.15)
    }

    // ---- apply with per-channel smoothing
    for (let i = 0; i < this.values.length; i++) {
      const name = this.morphNames[i]
      const rate = name.startsWith('eyeBlink') ? 38 : name.startsWith('viseme_') ? 24 : 10
      const v = damp(this.values[i], this.wanted[i], rate, dt)
      this.values[i] = v
      for (const [m, idx] of this.morphSlots[i]) m.morphTargetInfluences![idx] = v
    }
  }

  /** Hair bones: each swings opposite to the head's angular motion (tangential lag), driven through a damped spring. */
  private updateHair(dt: number, yaw: number, pitch: number, roll: number) {
    const ph = this.prevHead
    if (!ph.init) { ph.yaw = yaw; ph.pitch = pitch; ph.roll = roll; ph.init = true }
    const wy = (yaw - ph.yaw) / dt, wx = (pitch - ph.pitch) / dt, wz = (roll - ph.roll) / dt
    ph.yaw = yaw; ph.pitch = pitch; ph.roll = roll
    if (!this.hairPhysics || !this.hair.length) return
    const head = this.bn['Head']; if (!head) return
    head.getWorldQuaternion(this._pw)
    for (const h of this.hair) {
      const rx = Math.sin(h.angle) * 0.075, rz = -Math.cos(h.angle) * 0.075              // where this bone's tail sits around the head
      // tangential velocity of that point for the head's angular velocity w = (wx, wy, wz):  w x r
      const tx = wy * rz - wz * 0, ty = wz * rx - wx * rz, tz = wx * 0 - wy * rx
      this._v1.set(-tx, -ty * 0.5, -tz).multiplyScalar(0.12)                             // hair lags behind the motion
      this._v1.y += Math.sin(this.clock * 1.3 + h.angle) * 0.0015                        // a hint of idle sway
      // spring toward that target: semi-implicit Euler, slightly under-damped so it overshoots a little and settles
      h.v.addScaledVector(this._v2.copy(this._v1).sub(h.d), 90 * dt).addScaledVector(h.v, -9 * dt)
      h.d.addScaledVector(h.v, dt)
      const len = h.d.length(); if (len > 0.05) h.d.multiplyScalar(0.05 / len)
      // displacement of a hanging tip -> rotation about (down x d), converted into the bone's local space
      const rest = this.rest.get(h.bone.name)!
      this._v3.set(0, -1, 0).cross(h.d)
      const ang = h.d.length() / 0.08
      if (ang < 1e-5 || !isFinite(ang)) { h.bone.quaternion.copy(rest); continue }
      this._q.setFromAxisAngle(this._v3.normalize(), ang)
      // local offset = (pw * rest)^-1 * qWorld * (pw * rest)
      this._bw.copy(this._pw).multiply(rest)
      this._delta.copy(this._bw).invert().multiply(this._q).multiply(this._bw)
      h.bone.quaternion.copy(rest).multiply(this._delta)
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
        this.nextTalkGesture = 1.6 + Math.random() * 2.2
        const set: Gesture[] = ['talk1', 'talk2', 'present', 'beat', 'beatL', 'open', 'beat']
        this.play(set[Math.floor(Math.random() * set.length)])
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
      const curl = (tgt[i] - base[i]) * w          // the resting curl is already part of the rest pose
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
