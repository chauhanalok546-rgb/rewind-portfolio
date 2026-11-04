/** Presence: the camera is used ONLY to notice that someone is there. Detection runs on this device with MediaPipe;
 *  no frame is stored or sent anywhere, and only "a face is present" (plus where it is) is reported. */
export type CameraResult = 'watching' | 'denied' | 'unsupported' | 'failed'

export interface Presence {
  result: CameraResult
  /** resolves when a face has been steadily present for `holdMs` (or after `timeoutMs`, with false) */
  waitForFace(holdMs: number, timeoutMs: number, onPos?: (x: number, y: number) => void): Promise<boolean>
  stop(): void
}

const none = (result: CameraResult): Presence => ({ result, waitForFace: () => Promise.resolve(false), stop() {} })

/** Called while the loading screen is up: pulls the face-detection library, its WebAssembly runtime and the model into the browser cache, so that
 *  after the Enter click the detector starts in a blink instead of taking seconds. Nothing is started and no camera is touched. */
export function warmPresence() {
  void import('@mediapipe/tasks-vision').catch(() => undefined)
  for (const u of ['/mediapipe/wasm/vision_wasm_internal.wasm', '/mediapipe/wasm/vision_wasm_internal.js', '/models/blaze_face_short_range.tflite']) void fetch(u).catch(() => undefined)
}

/** Call from the Enter click: it asks the browser for camera permission right away. */
export async function startPresence(): Promise<Presence> {
  if (!navigator.mediaDevices?.getUserMedia) return none('unsupported')
  let stream: MediaStream
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio: false }) }
  catch (e) { return none((e as DOMException)?.name === 'NotAllowedError' || (e as DOMException)?.name === 'SecurityError' ? 'denied' : 'failed') }

  const video = document.createElement('video')
  video.muted = true; video.playsInline = true; video.srcObject = stream
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  let stopped = false
  const stop = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); video.remove() }

  try {
    await video.play()
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')   // loaded only when the camera is on
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const detector = await FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite' }, runningMode: 'VIDEO', minDetectionConfidence: 0.6,
    })
    return {
      result: 'watching',
      stop() { stop(); detector.close() },
      waitForFace(holdMs, timeoutMs, onPos) {
        return new Promise<boolean>((resolve) => {
          const started = performance.now(); let since = 0
          const tick = () => {
            if (stopped) return resolve(false)
            const now = performance.now()
            if (now - started > timeoutMs) return resolve(false)
            if (video.readyState >= 2) {
              const face = detector.detectForVideo(video, now).detections[0]
              const box = face?.boundingBox
              if (box) {
                if (!since) since = now
                onPos?.((box.originX + box.width / 2) / video.videoWidth, (box.originY + box.height / 2) / video.videoHeight)
                if (now - since >= holdMs) return resolve(true)
              } else since = 0
            }
            setTimeout(tick, 120)
          }
          tick()
        })
      },
    }
  } catch (e) {
    console.warn('face detection unavailable:', e); stop(); return none('failed')
  }
}

/** Self-test (used in development): runs the same detector on a still image and returns how many faces it found. */
export async function detectInImage(url: string): Promise<{ faces: number; confidence?: number }> {
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  const detector = await FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 })
  const img = new Image(); img.src = url; await img.decode()
  const res = detector.detect(img); detector.close()
  return { faces: res.detections.length, confidence: res.detections[0]?.categories[0]?.score }
}
