import { CATEGORIES, STATUSES } from '../data/categories'
import { useStationCheck } from '../rail/useStationCheck'
import { deletePlace, savePlace } from '../store'
import type { Place, PlaceCategory, PlaceStatus } from '../types'

interface Props {
  place: Place
  /** Status as shown: automatic while the place is part of the trip */
  status: PlaceStatus
  /** Where the trip uses this place (as a stop, a bed or a thing to do) */
  uses: { stopId: string; label: string }[]
  /** Closest stop of the trip, to add the place as a thing to do there */
  nearest: { id: string; name: string } | null
  onClose: () => void
  onMove: () => void
  onTrains: () => void
  onAddAsStop: () => void
  onAddToStop: (stopId: string) => void
  onOpenStop: (stopId: string) => void
}

export default function PlaceEditor({ place, status, uses, nearest, onClose, onMove, onTrains, onAddAsStop, onAddToStop, onOpenStop }: Props) {
  const set = (patch: Partial<Place>) => savePlace({ ...place, ...patch })
  // Saved stations are used as they are; anything else needs a station nearby
  const trains = useStationCheck(place.name, place.lat, place.lng, place.category === 'station')
  const noTrains = trains.state === 'no'

  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Place · saved automatically</span>
      </div>

      <label className="field">
        <span>Name</span>
        <input value={place.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Charles Bridge" />
      </label>

      <div className="field">
        <span>Category</span>
        <div className="chips">
          {(Object.keys(CATEGORIES) as PlaceCategory[]).map((c) => (
            <button
              key={c}
              className={'chip' + (place.category === c ? ' active' : '')}
              onClick={() => set({ category: c })}
            >
              {CATEGORIES[c].icon} {CATEGORIES[c].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Status</span>
        {uses.length ? (
          <span className="small">
            <span className="status-dot" style={{ background: STATUSES[status].color }} /> {STATUSES[status].label} · set
            automatically while it's part of your trip
          </span>
        ) : (
          <div className="segmented">
            {(['idea', 'visited'] as PlaceStatus[]).map((s) => (
              <button
                key={s}
                className={status === s ? 'active' : ''}
                style={{ '--seg': STATUSES[s].color } as React.CSSProperties}
                onClick={() => set({ status: s })}
              >
                {STATUSES[s].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={5}
          value={place.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Opening hours, tips, prices…"
        />
      </label>

      <label className="field">
        <span>Link</span>
        <input
          type="url"
          value={place.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://"
        />
      </label>
      {place.url && (
        <a className="link" href={place.url} target="_blank" rel="noreferrer">Open link ↗</a>
      )}

      <div className="field">
        <span>Trip</span>
        <div className="chips">
          {uses.map((u, i) => (
            <button key={i} className="chip" onClick={() => onOpenStop(u.stopId)}>
              {u.label}
            </button>
          ))}
          <button className="chip add" onClick={onAddAsStop}>+ New stop</button>
          {nearest && (
            <button className="chip add" onClick={() => onAddToStop(nearest.id)}>
              + To do in {nearest.name}
            </button>
          )}
        </div>
      </div>

      <div className="row">
        <button
          onClick={onTrains}
          disabled={noTrains || trains.state === 'checking'}
          title={noTrains ? 'No railway station near this place' : trains.state === 'yes' ? `From ${trains.station.name}` : undefined}
        >
          {trains.state === 'checking' ? '🚆 Checking…' : noTrains ? '🚆 No trains here' : '🚆 Direct trains'}
        </button>
        <button onClick={onMove}>📍 Move pin</button>
        <a
          className="button"
          href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          Directions ↗
        </a>
        <button
          className="danger"
          onClick={() => {
            const extra = uses.length ? ' It is also removed from your trip.' : ''
            if (confirm(`Delete "${place.name}"?${extra}`)) {
              deletePlace(place.id)
              onClose()
            }
          }}
        >
          Delete
        </button>
      </div>
      <p className="muted small">
        {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
      </p>
    </div>
  )
}
