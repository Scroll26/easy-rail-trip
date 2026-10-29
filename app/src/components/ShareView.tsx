import { useState } from 'react'
import { canShareLive, liveLink, snapshotLink, startLiveShare, stopLiveShare } from '../share'
import type { Settings } from '../types'

/** Share the trip read-only: a live link that follows your changes, or a snapshot in the link itself */
export default function ShareView({ share, onClose }: { share: Settings['share']; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [snapshot, setSnapshot] = useState<string | null>(null)

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

  return (
    <div className="editor share-view">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Share your trip</span>
      </div>
      <p className="small">
        People with the link see your map and trip list and can open the details of each stop and connection, but
        they can't change anything. They don't need the app or an account.
      </p>

      <section>
        <h3>Live link</h3>
        {share ? (
          <>
            <LinkBox url={liveLink(share.id)} />
            <p className="muted small">
              Always shows your current plan: changes are uploaded a few seconds after you make them (on any of your
              synced devices).
            </p>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                confirm('Switch the live link off? It stops working for everyone who has it.') && run(stopLiveShare)
              }
            >
              Stop sharing
            </button>
          </>
        ) : (
          <>
            <p className="muted small">
              A short link that keeps up with your changes. You can switch it off any time. Needs Google Drive sync
              (Settings → Sync).
            </p>
            <button className="primary" disabled={busy || !canShareLive()} onClick={() => run(startLiveShare)}>
              {busy ? 'Making the link…' : '🔗 Make a live link'}
            </button>
          </>
        )}
      </section>

      <section>
        <h3>Snapshot link</h3>
        <p className="muted small">
          The trip as it is right now, packed into the link itself: works without any server, but later changes don't
          show and it can't be switched off. Make a new one after you change things.
        </p>
        {snapshot ? (
          <>
            <LinkBox url={snapshot} />
            <p className="muted small">
              {Math.ceil(snapshot.length / 1000)} k characters
              {snapshot.length > 8000 ? ': long, so some chat apps may cut it off. The live link is safer.' : '.'}
            </p>
          </>
        ) : (
          <button disabled={busy} onClick={() => run(async () => setSnapshot(await snapshotLink()))}>
            📸 Make a snapshot link
          </button>
        )}
      </section>

      {message && <p className="small warn-text">{message}</p>}

      <p className="muted small">
        Shared: your stops, connections and things to do, with the map settings you have now. Not shared: prices and
        your budget, places that aren't part of the trip, and people's addresses and contact details (only their name
        and roughly where they live).
      </p>
    </div>
  )
}

function LinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy the link:', url)
    }
  }
  return (
    <div className="link-box">
      <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
      <div className="row">
        <button className="primary" onClick={copy}>{copied ? '✓ Copied' : '📋 Copy'}</button>
        {'share' in navigator && (
          <button onClick={() => navigator.share({ title: 'My trip', url }).catch(() => {})}>📤 Send…</button>
        )}
        <a className="button" href={url} target="_blank" rel="noreferrer">
          👁️ Preview
        </a>
      </div>
    </div>
  )
}
