import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './styles/shell.css'
import './styles/dashboard.css'
import './styles/pages.css'
import './styles/assistant.css'
import './styles/auth.css'
import './styles/friends.css'
import './styles/mobile.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// installable app: the service worker lets it open without a connection (production builds only,
// so the dev server always serves fresh code)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => null)
    // hand over the files already loaded, so the first visit is enough to work offline
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: 'warm', urls: performance.getEntriesByType('resource').map((e) => e.name) }))
      .catch(() => null)
  })
}
