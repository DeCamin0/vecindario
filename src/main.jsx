import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { syncBrandFavicon } from './syncBrandFavicon.js'
import App from './App.jsx'

try {
  syncBrandFavicon()
} catch (e) {
  console.warn('[Vecindario] favicon:', e)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
