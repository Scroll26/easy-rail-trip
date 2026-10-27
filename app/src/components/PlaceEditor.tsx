import { CATEGORIES, STATUSES } from '../data/categories'
import { formatDay } from '../dates'
import { deletePlace, savePlace } from '../store'
import type { Place, PlaceCategory, PlaceStatus, TimelineItem } from '../types'

interface Props {
  place: Place
  /** Timeline entries that point at this place */
  scheduled: TimelineItem[]
  onClose: () => void
  onMove: () => void
  onTrains: () => void
  onAddToTimeline: () => void
  onOpenItem: (id: string) => void
}

export default function PlaceEditor({ place, scheduled, onClose, onMove, onTrains, onAddToTimeline, onOpenItem }: Props) {
  const set = (patch: Partial<Place>) => savePlace({ ...place, ...patch })

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
        <div className="segmented">
          {(Object.keys(STATUSES) as PlaceStatus[]).map((s) => (
            <button
              key={s}
              className={place.status === s ? 'active' : ''}
              style={{ '--seg': STATUSES[s].color } as React.CSSProperties}
              onClick={() => set({ status: s })}
            >
              {STATUSES[s].label}
            </button>
          ))}
        </div>
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
        <span>Timeline</span>
        <div className="chips">
          {scheduled.map((i) => (
            <button key={i.id} className="chip" onClick={() => onOpenItem(i.id)}>
              {i.type === 'stay' ? '🛏️ ' : '📅 '}
              {i.date ? formatDay(i.date) : 'Unscheduled'}
            </button>
          ))}
          <button className="chip add" onClick={onAddToTimeline}>+ Add to timeline</button>
        </div>
      </div>

      <div className="row">
        <button onClick={onTrains}>🚆 Direct trains</button>
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
            const extra = scheduled.length ? ` It's also removed from ${scheduled.length} timeline entries.` : ''
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
