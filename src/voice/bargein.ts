/** Barge-in: while the mic is on, notice when the VISITOR starts talking over him and tell the app at once, so it can turn his voice (and the music)
 *  right down. With his voice quiet, the speech recogniser hears the visitor instead of his own narration, so "Hey Alok" gets through.
 *  Uses a second microphone stream with the browser's echo cancellation on, and compares the level with what his own voice leaks in. */
export function startBargeIn(onChange: (talking: boolean) => void): () => void {
  let stopped = false, ctx: AudioContext | null = null, stream: MediaStream | null = null, timer = 0
  navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }).then((s) => {
    if (stopped) { s.getTracks().forEach((t) => t.stop()); return }
    stream = s
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC(); const src = ctx.createMediaStreamSource(s), an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an)   // not connected to the speakers
    const buf = new Float32Array(an.fftSize)
    let base = 0.01, loud = 0, quiet = 0, talking = false
    timer = window.setInterval(() => {
      an.getFloatTimeDomainData(buf)
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      if (!talking) base = base * 0.97 + rms * 0.03                         // what the room and his own leaking voice normally measure
      const hot = rms > Math.max(0.035, base * 2.4)
      if (hot) { loud++; quiet = 0 } else { quiet++; loud = 0 }
      if (!talking && loud >= 3) { talking = true; onChange(true) }          // about 150 ms of clearly louder sound
      if (talking && quiet >= 14) { talking = false; onChange(false) }       // 700 ms of calm: they stopped
    }, 50)
  }).catch(() => undefined)
  return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); void ctx?.close() }
}
