import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { persistence } from './store'

registerSW({ immediate: true })

// Ask the browser not to evict our offline data when storage runs low
navigator.storage?.persist?.()

// Render only after the local trip data is loaded, so lists don't flash empty
persistence.whenSynced.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
