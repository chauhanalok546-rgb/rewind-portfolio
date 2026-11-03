import './style.css'
import { startApp } from './app/app'

startApp().catch((e) => console.error('Rewind failed to start:', e))
