import { useState } from 'react'
import { canShare, deleteSnapshot, saveSnapshot, shareLink } from '../share'
import type { Settings } from '../types'

const when = (t: number) =>
  new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Share the trip read-only as a snapshot behind a short link */
export default function ShareSection({ share }: { share: Settings['share'] }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  if (!canShare()) return null

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

  const url = share && shareLink(share.id)
  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy the link:', url)
    }
  }

  return (
    <section className="share-section">
      <h3>Share your trip</h3>
      <p className="muted small">
        A read-only link for family and friends: they see your trip the way <b>View trip</b> shows it (same pins, lines
        and map options) and can open each stop and connection, but can't change anything. No app or account needed.
      </p>
      {share && url ? (
        <>
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
          <p className="muted small">
            Shows your trip as of <b>{when(share.at)}</b>. Changes since then aren't in it until you update it; the link
            stays the same. It's deleted automatically a year after the last update.
          </p>
          <div className="row">
            <button disabled={busy} onClick={() => run(saveSnapshot)}>
              {busy ? 'Working…' : '🔄 Update to the trip as it is now'}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => confirm('Delete the shared link? It stops working for everyone who has it.') && run(deleteSnapshot)}
            >
              Delete link
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">
            The link shows the trip as it is when you make it, until you update it. Needs Google Drive sync (above).
          </p>
          <button className="primary" disabled={busy} onClick={() => run(saveSnapshot)}>
            {busy ? 'Making the link…' : '🔗 Make a share link'}
          </button>
        </>
      )}
      {message && <p className="small warn-text">{message}</p>}
      <p className="muted small">
        Not shared: prices and your budget, pins hidden in View trip, and people's addresses and contact details (only
        their name and roughly where they live).
      </p>
    </section>
  )
}
