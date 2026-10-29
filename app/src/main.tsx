import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import Viewer, { ShareError } from './components/Viewer'
import { persistence, viewingShare } from './store'
import { loadShareFromUrl, showShared, startSharePush } from './share'
import { startSync } from './sync/sync'

registerSW({ immediate: true })

// A shared link pasted into the open app: start over as a viewer (or back as your own trip)
window.addEventListener('hashchange', () => {
  if (viewingShare || /^#(share|trip)=/.test(location.hash)) location.reload()
})

const root = createRoot(document.getElementById('root')!)

if (viewingShare) {
  // Someone's shared trip: read-only, nothing of it is saved except a copy for offline use
  loadShareFromUrl()
    .then((loaded) => {
      showShared(loaded.trip)
      root.render(
        <StrictMode>
          <Viewer initial={loaded} />
        </StrictMode>,
      )
    })
    .catch((e: Error) => root.render(<ShareError message={e.message} />))
} else {
  // Ask the browser not to evict our offline data when storage runs low
  navigator.storage?.persist?.()

  // Render only after the local trip data is loaded, so lists don't flash empty
  persistence!.whenSynced.then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    startSync()
    startSharePush()
  })
}
