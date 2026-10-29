import { CATEGORIES } from '../data/categories'
import { formatDay } from '../dates'
import { LINE_KINDS, lineTitle, type RouteFocus } from '../lines'
import { activityDay, stayName, stopDayLabel, stopDays, type LineEntry, type Lookup, type StopEntry } from '../trip'
import type { Activity, TravelLine } from '../types'
import RouteInfo from './RouteInfo'

// Read-only details of a stop or a connection, for shared trips

const nightsLabel = (n: number) => (n === 0 ? 'passing through' : n === 1 ? '1 night' : `${n} nights`)

export function StopDetails({
  entry,
  activities,
  lookup,
  onClose,
  onShowPlace,
}: {
  entry: StopEntry
  activities: Activity[]
  lookup: Lookup
  onClose: () => void
  onShowPlace: (id: string) => void
}) {
  const { stop } = entry
  const place = lookup.places.get(stop.placeId)
  const bed = stayName(stop, lookup)
  const bedPlace = stop.stay?.placeId
  const days: (number | null)[] = [null, ...Array.from({ length: stopDays(entry) }, (_, i) => i)]
  const byTime = (a: Activity, b: Activity) => (a.time || '99').localeCompare(b.time || '99') || a.order - b.order
  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Stop</span>
      </div>
      <h3>
        {place ? CATEGORIES[place.category].icon : '📍'} {place?.name || 'Unnamed'}
      </h3>
      <div className="detail-facts small">
        <p>
          📅 {formatDay(entry.arrive)}
          {stop.nights > 0 ? ` → ${formatDay(entry.depart)}` : ''} · {nightsLabel(stop.nights)}
        </p>
        {stop.nights > 0 && (
          <p>
            {bed ? (
              <>
                🛏️{' '}
                {bedPlace ? (
                  <button className="ghost link-btn inline" onClick={() => onShowPlace(bedPlace)}>
                    {bed}
                  </button>
                ) : (
                  bed
                )}
              </>
            ) : (
              <span className="muted">🛏️ No bed planned yet</span>
            )}
          </p>
        )}
      </div>
      {activities.length > 0 && (
        <div className="field">
          <span>Things to do</span>
          {days.map((d) => {
            const list = activities.filter((a) => activityDay(a, entry) === d).sort(byTime)
            if (!list.length) return null
            return (
              <div key={String(d)} className="activity-day">
                <h4>{stopDayLabel(entry, d)}</h4>
                <ul className="list">
                  {list.map((a) => {
                    const p = a.placeId ? lookup.places.get(a.placeId) : undefined
                    return (
                      <li key={a.id} className="activity read-only">
                        {a.time && <span className="time-text small">{a.time}</span>}
                        {p ? (
                          <button className="item" onClick={() => onShowPlace(p.id)}>
                            <span className="item-icon plain">{CATEGORIES[p.category].icon}</span>
                            <span className="item-main">
                              <strong className="ellipsis">{p.name || 'Unnamed'}</strong>
                            </span>
                          </button>
                        ) : (
                          <span className="item-main">📝 {a.title}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
      {stop.notes && <p className="notes-text small">{stop.notes}</p>}
    </div>
  )
}

export function LineDetails({
  line,
  entry,
  lookup,
  onClose,
  routeFocus,
  onRouteFocus,
}: {
  line: TravelLine
  entry: LineEntry | undefined
  lookup: Lookup
  onClose: () => void
  routeFocus: RouteFocus | null
  onRouteFocus: (f: RouteFocus | null) => void
}) {
  const kind = LINE_KINDS[line.kind]
  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Connection</span>
      </div>
      <h3 className="line-title">{lineTitle(line, lookup)}</h3>
      <div className="detail-facts small">
        <p>
          {kind.icon} {line.kind === 'train' ? 'Train' : 'Rough plan, no train chosen yet'}
          {line.overnight ? ' · 🌙 night train' : ''}
        </p>
        {entry && (
          <p>
            📅 {formatDay(entry.date)}
            {entry.arrive !== entry.date ? ` → arrives ${formatDay(entry.arrive)}` : ''}
          </p>
        )}
      </div>
      {line.kind === 'train' && (
        <RouteInfo line={line} lookup={lookup} routeFailed={false} readOnly routeFocus={routeFocus} onRouteFocus={onRouteFocus} />
      )}
      {line.notes && <p className="notes-text small">{line.notes}</p>}
    </div>
  )
}
