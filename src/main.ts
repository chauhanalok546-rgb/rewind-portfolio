import './style.css'

/** If WebGL or the avatar cannot load, show a calm fallback with the classic portfolio instead of a blank page. */
function fallback(reason: string) {
  console.error('Rewind fallback:', reason)
  document.getElementById('boot')?.remove()
  const box = document.createElement('section'); box.className = 'screen'; box.style.zIndex = '90'
  box.innerHTML = `<div class="glass card"><p class="eyebrow mono">alok.os v18</p><h1>This trip needs a newer browser</h1><p>The interactive version uses WebGL and sound. Try Chrome, Edge or Safari on a recent computer or phone.</p><a class="btn primary big" href="https://github.com/chauhanalok546-rgb/Portfolio" style="text-decoration:none">Open the classic portfolio</a><p class="fine">github.com/chauhanalok546-rgb</p></div>`
  document.body.appendChild(box)
}
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } }

if (!hasWebGL()) fallback('no webgl')
else import('./app/app').then((m) => m.startApp()).catch((e) => fallback(String(e)))
