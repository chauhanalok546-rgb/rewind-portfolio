/** Warm-up helpers so nothing heavy starts at the exact moment a scene begins: backdrop videos are created, loaded and decoded ahead of time. */
const videos = new Map<string, HTMLVideoElement>()
export function warmVideo(name: string) {
  if (videos.has(name)) return
  const v = document.createElement('video')
  v.className = 'bgvid'; v.src = `/video/${name}.mp4`; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('aria-hidden', 'true')
  v.addEventListener('error', () => videos.delete(name), { once: true })
  v.load(); videos.set(name, v)
}
/** hands over the already-loaded element (and warms a fresh one a few seconds later for a replay) */
export function takeVideo(name: string): HTMLVideoElement | null {
  const v = videos.get(name) ?? null
  videos.delete(name); setTimeout(() => warmVideo(name), 6000)
  return v
}
