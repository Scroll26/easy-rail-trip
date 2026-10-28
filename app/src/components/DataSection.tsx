import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { deleteEverywhere, deleteLocalData, isSyncOn, useSyncState } from '../sync/sync'

const MAP_CACHES = ['basemap', 'railways']

const mb = (bytes: number) => (bytes < 1e6 ? `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e6)} MB`)

interface Usage {
  total: number | null
  mapTiles: number
}

async function measure(): Promise<Usage> {
  let total: number | null = null
  try {
    total = (await navigator.storage?.estimate?.())?.usage ?? null
  } catch {
    /* not supported */
  }
  let mapTiles = 0
  try {
    for (const name of MAP_CACHES) mapTiles += (await (await caches.open(name)).keys()).length
  } catch {
    /* no cache storage */
  }
  return { total, mapTiles }
}

type Pending = 'device' | 'everywhere' | null

export default function DataSection({ onExport }: { onExport: () => void }) {
  const sync = useSyncState()
  const [usage, setUsage] = useState<Usage | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const syncOn = sync.configured && isSyncOn()

  useEffect(() => {
    measure().then(setUsage)
  }, [])

  async function clearMapCache() {
    for (const name of MAP_CACHES) await caches.delete(name).catch(() => false)
    setUsage(await measure())
  }

  async function confirmDelete() {
    setBusy(true)
    setError('')
    try {
      if (pending === 'everywhere') await deleteEverywhere()
      else await deleteLocalData()
    } catch (e) {
      setError(`Couldn't delete the Google Drive copy: ${(e as Error).message}. Nothing was deleted.`)
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>Data &amp; storage</h3>
      <p className="muted small">
        {usage?.total != null ? <>This app uses about <b>{mb(usage.total)}</b> on this device. </> : null}
        Your trip itself is tiny (a few hundred KB at most). Most of the space is map areas saved for offline use
        {usage ? ` (${usage.mapTiles.toLocaleString('en-GB')} map pieces)` : ''}, which are capped and cleaned up
        automatically.
      </p>
      <div className="row">
        <button onClick={clearMapCache}>🧹 Clear saved map areas</button>
      </div>

      <div className="danger-zone">
        <b>Delete trip data</b>
        <div className="row">
          <button className="danger" onClick={() => setPending('device')}>🗑️ Delete on this device</button>
          {syncOn && (
            <button className="danger" onClick={() => setPending('everywhere')}>
              🗑️ Delete everywhere (incl. Google Drive)
            </button>
          )}
        </div>
      </div>

      {/* Rendered at the page level: the panel it's opened from may be slid down */}
      {pending &&
        createPortal(
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="modal">
              <h3 id="delete-title">Are you sure?</h3>
              {pending === 'device' ? (
                <>
                  <p>
                    This deletes <b>all places, people, groups, the trip with its stops and connections, and the budget</b> on this device, plus
                    its settings and saved lookups.
                  </p>
                  <p className={'recover ' + (syncOn ? 'yes' : 'no')}>
                    {syncOn
                      ? '↩ Recoverable: your trip stays in your Google Drive. Sync on this device is switched off; connect it again to get everything back.'
                      : '⚠ Not recoverable, unless you have exported a backup file (you can import it again).'}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    This deletes your trip from <b>this device and from your Google Drive</b>, and switches sync off.
                  </p>
                  <p className="recover no">
                    ⚠ Not recoverable, unless you have exported a backup file. Other devices that are still connected keep
                    their own copy and would upload it again: delete it there too, or disconnect them first.
                  </p>
                </>
              )}
              {error && <p className="error-text small">{error}</p>}
              <div className="row modal-actions">
                <button onClick={onExport} disabled={busy}>⬇ Export a backup first</button>
                <span className="spacer" />
                <button onClick={() => setPending(null)} disabled={busy}>Cancel</button>
                <button className="danger solid" onClick={confirmDelete} disabled={busy}>
                  {busy ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}
