import { useEffect, useState } from 'react'
import { connect, disconnect, resolveChoice, syncNow, useSyncState } from '../sync/sync'

const exactFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** "Tue 27 Oct, 14:32:05" */
const exact = (t: number) => exactFormat.format(t)

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function SyncSection() {
  const sync = useSyncState()
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [, tick] = useState(0)

  // Keep "x min ago" fresh
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!sync.configured)
    return (
      <section>
        <h3>Sync</h3>
        <p className="muted small">Google Drive sync isn't set up for this copy of the app.</p>
      </section>
    )

  if (choosing)
    return (
      <section className="sync-choice">
        <h3>Sync</h3>
        <p>
          <b>This device and your Google Drive both already have a trip.</b> What should happen?
        </p>
        <button
          className="primary"
          disabled={busy}
          onClick={() => run(async () => { setChoosing(false); await resolveChoice('merge') })}
        >
          Merge both (recommended)
        </button>
        <p className="muted small">Everything from both is kept. Nothing is deleted.</p>
        <button
          disabled={busy}
          onClick={() => {
            if (confirm("Replace this device's trip with the one from Google Drive? This device's data will be deleted."))
              run(() => resolveChoice('replace'))
          }}
        >
          Use only the Drive copy
        </button>
        <p className="muted small">This device's current data is deleted and replaced, e.g. if it only held test entries.</p>
        <button className="ghost" disabled={busy} onClick={() => run(async () => { setChoosing(false); await resolveChoice('cancel') })}>
          Cancel
        </button>
      </section>
    )

  if (sync.status === 'off')
    return (
      <section>
        <h3>Sync</h3>
        <p className="muted small">
          Keep your trip the same on your phone and computer. It's saved in a hidden app folder in <b>your own</b> Google
          Drive. Only this app can see that folder, and it doesn't touch your other files.
        </p>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              if ((await connect()) === 'choose') setChoosing(true)
            })
          }
        >
          {busy ? 'Connecting…' : '☁️ Connect Google Drive'}
        </button>
        {message && <p className="small error-text">{message}</p>}
      </section>
    )

  const line: Record<string, string> = {
    idle: '✓ Up to date',
    syncing: 'Syncing…',
    offline: "Offline. Changes are saved on this device and sync when you're back online.",
    'needs-auth': 'Google needs you to reconnect (this happens about once an hour).',
    error: `Couldn't sync: ${sync.error}`,
  }

  return (
    <section>
      <h3>Sync · Google Drive</h3>
      <p className={'small sync-line ' + sync.status}>{line[sync.status]}</p>
      <p className="small muted last-sync">
        Last synced: {sync.lastSync ? <><b>{exact(sync.lastSync)}</b> ({ago(sync.lastSync)})</> : 'not yet'}
      </p>
      <div className="row">
        <button
          className={sync.status === 'needs-auth' || sync.status === 'error' ? 'primary' : ''}
          disabled={busy || sync.status === 'syncing'}
          onClick={() => run(() => syncNow(true))}
        >
          {sync.status === 'needs-auth' ? '🔄 Reconnect' : '🔄 Sync now'}
        </button>
        <button
          className="ghost"
          disabled={busy}
          onClick={() => {
            if (confirm('Stop syncing this device? Your data stays on this device and in your Drive.'))
              run(() => disconnect())
          }}
        >
          Disconnect
        </button>
      </div>
      {message && <p className="small error-text">{message}</p>}
    </section>
  )
}

/** Small button on the map when syncing needs a tap (sign-in expired or error) */
export function SyncChip() {
  const sync = useSyncState()
  if (sync.status !== 'needs-auth' && sync.status !== 'error') return null
  return (
    <button className="sync-chip" onClick={() => void syncNow(true)} title={sync.error || 'Reconnect Google Drive'}>
      ☁️ Tap to sync
    </button>
  )
}
