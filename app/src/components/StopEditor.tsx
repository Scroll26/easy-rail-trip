import { useState } from 'react'
import { CATEGORIES } from '../data/categories'
import { formatDay } from '../dates'
import { deleteActivity, deleteStop, newId, nextActivityOrder, saveActivity, saveStop } from '../store'
import { activityDate, activityDay, km, stayName, stopDayLabel, stopDays, type Lookup, type StopEntry, type Trip } from '../trip'
import type { Activity, StayInfo, Stop } from '../types'
import PriceField from './PriceField'
import GapNotice from './GapNotice'

interface Props {
  trip: Trip
  entry: StopEntry
  activities: Activity[]
  lookup: Lookup
  onClose: () => void
  onOpenPlace: (id: string) => void
  onShowPlace: (id: string) => void
  onTrains: () => void
}

type StayKind = 'none' | 'place' | 'person' | 'other'

const nightsLabel = (n: number) => (n === 0 ? 'passing through' : n === 1 ? '1 night' : `${n} nights`)

export default function StopEditor({ trip, entry, activities, lookup, onClose, onOpenPlace, onShowPlace, onTrains }: Props) {
  const { stop } = entry
  const place = lookup.places.get(stop.placeId)
  const [picking, setPicking] = useState(false)
  const [filter, setFilter] = useState('')
  const set = (patch: Partial<Stop>) => saveStop({ ...stop, ...patch })
  const setStay = (patch: Partial<StayInfo>) => set({ stay: { name: '', price: null, ...stop.stay, ...patch } })

  const stayKind: StayKind = !stop.stay
    ? 'none'
    : stop.stay.placeId
      ? 'place'
      : stop.stay.personId
        ? 'person'
        : 'other'
  const near = (p: { lat: number | null; lng: number | null }) =>
    place && p.lat != null && p.lng != null ? km(place, { lat: p.lat, lng: p.lng }) : Infinity
  // Beds: accommodation pins first, then by distance to the stop
  const stayPlaces = [...lookup.places.values()].sort(
    (a, b) => Number(b.category === 'stay') - Number(a.category === 'stay') || near(a) - near(b),
  )
  const stayPeople = [...lookup.people.values()].sort((a, b) => Number(b.canStay) - Number(a.canStay) || near(a) - near(b))

  function setStayKind(k: StayKind) {
    if (k === 'none') return set({ stay: null })
    const keep = { name: stop.stay?.name ?? '', price: stop.stay?.price ?? null, paidExpenseId: stop.stay?.paidExpenseId }
    if (k === 'place') set({ stay: { ...keep, placeId: stayPlaces[0]?.id ?? null, personId: null } })
    else if (k === 'person') set({ stay: { ...keep, personId: stayPeople[0]?.id ?? null, placeId: null } })
    else set({ stay: { ...keep, placeId: null, personId: null } })
  }

  function addActivity(patch: Partial<Activity>) {
    const now = Date.now()
    saveActivity({
      id: newId(),
      stopId: stop.id,
      day: null,
      placeId: null,
      title: '',
      time: '',
      order: nextActivityOrder(stop.id),
      createdAt: now,
      updatedAt: now,
      ...patch,
    })
  }

  const days = stopDays(entry)
  const buckets: (number | null)[] = [null, ...Array.from({ length: days }, (_, i) => i)]
  const sortInDay = (a: Activity, b: Activity) =>
    (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : a.order - b.order
  const dayLabel = (d: number | null) => stopDayLabel(entry, d)

  const used = new Set(activities.map((a) => a.placeId))
  const q = filter.trim().toLowerCase()
  const candidates = [...lookup.places.values()]
    .filter((p) => p.id !== stop.placeId && !used.has(p.id) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => near(a) - near(b))
    .slice(0, 40)

  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Stop · saved automatically</span>
      </div>

      <div className="stop-title">
        <h3>
          {place ? CATEGORIES[place.category].icon : '📍'} {place?.name || 'Unnamed'}
        </h3>
        {place && (
          <button className="ghost link-btn" onClick={() => onOpenPlace(place.id)}>
            Place details →
          </button>
        )}
      </div>
      <p className="small">
        📅 {formatDay(entry.arrive)}
        {stop.nights > 0 ? ` → ${formatDay(entry.depart)}` : ''} · {nightsLabel(stop.nights)}
      </p>
      <GapNotice trip={trip} id={entry.id} gap={entry.gap} lookup={lookup} />

      <div className="row two">
        <div className="field">
          <span>Nights</span>
          <div className="stepper">
            <button onClick={() => set({ nights: Math.max(0, stop.nights - 1) })} disabled={stop.nights === 0} aria-label="One night less">
              −
            </button>
            <input
              type="number"
              min={0}
              max={90}
              value={stop.nights}
              onChange={(e) => set({ nights: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
              aria-label="Nights"
            />
            <button onClick={() => set({ nights: Math.min(90, stop.nights + 1) })} aria-label="One night more">
              +
            </button>
          </div>
        </div>
        <label className="field">
          <span>Arrival{stop.fixedDate ? ' (fixed)' : ''}</span>
          <input type="date" value={entry.arrive} onChange={(e) => e.target.value && set({ fixedDate: e.target.value })} />
        </label>
      </div>
      {stop.fixedDate ? (
        <p className="muted small">
          This date stays put when stops before it change.{' '}
          <button className="ghost link-btn inline" onClick={() => set({ fixedDate: null })}>
            Follow the stop before instead
          </button>
        </p>
      ) : (
        <p className="muted small">The arrival follows the stop before. Pick a date to fix it (e.g. a booked train).</p>
      )}

      <div className="field">
        <span>Where you sleep</span>
        <div className="segmented">
          {(['none', 'place', 'person', 'other'] as StayKind[]).map((k) => (
            <button
              key={k}
              className={stayKind === k ? 'active' : ''}
              onClick={() => setStayKind(k)}
              disabled={(k === 'place' && !stayPlaces.length) || (k === 'person' && !stayPeople.length)}
            >
              {{ none: 'Not yet', place: 'Place', person: 'Person', other: 'Other' }[k]}
            </button>
          ))}
        </div>
        {stayKind === 'place' && (
          <select value={stop.stay?.placeId ?? ''} onChange={(e) => setStay({ placeId: e.target.value })}>
            {stayPlaces.map((p) => (
              <option key={p.id} value={p.id}>
                {CATEGORIES[p.category].icon} {p.name || 'Unnamed'}
              </option>
            ))}
          </select>
        )}
        {stayKind === 'person' && (
          <select value={stop.stay?.personId ?? ''} onChange={(e) => setStay({ personId: e.target.value })}>
            {stayPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Unnamed'}
                {p.city ? ` (${p.city})` : ''}
                {p.canStay ? ' · can stay' : ''}
              </option>
            ))}
          </select>
        )}
        {stayKind === 'other' && (
          <input value={stop.stay?.name ?? ''} onChange={(e) => setStay({ name: e.target.value })} placeholder="e.g. Hostel One Prague" />
        )}
      </div>
      {stop.stay && stayKind !== 'person' && (
        <PriceField
          label="Price for all nights"
          price={stop.stay.price}
          paidExpenseId={stop.stay.paidExpenseId}
          onChange={setStay}
          payDate={entry.arrive}
          category="stay"
          note={stayName(stop, lookup) || place?.name || 'Accommodation'}
        />
      )}

      <div className="field">
        <span>Things to do</span>
        {buckets.map((d) => {
          const list = activities.filter((a) => activityDay(a, entry) === d).sort(sortInDay)
          if (d == null && list.length === 0 && activities.length === 0) return null
          if (d != null && list.length === 0) return null
          return (
            <div key={String(d)} className="activity-day">
              <h4>{dayLabel(d)}</h4>
              <ul className="list">
                {list.map((a) => (
                  <ActivityRow
                    key={a.id}
                    a={a}
                    entry={entry}
                    lookup={lookup}
                    dayOptions={buckets}
                    dayLabel={dayLabel}
                    onShowPlace={onShowPlace}
                  />
                ))}
              </ul>
            </div>
          )
        })}
        {activities.length === 0 && !picking && (
          <p className="muted small">Add sights, food and notes. Give them a day once you know it.</p>
        )}
        {picking ? (
          <div className="picker">
            <div className="row list-head">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter your places…" autoFocus />
              <button className="ghost" onClick={() => setPicking(false)}>Done</button>
            </div>
            <ul className="list">
              {candidates.length === 0 && (
                <li className="empty">No places left. Add some in the Places tab (or tap the map), they show up here.</li>
              )}
              {candidates.map((p) => (
                <li key={p.id}>
                  <button className="item" onClick={() => addActivity({ placeId: p.id })}>
                    <span className="item-icon plain">{CATEGORIES[p.category].icon}</span>
                    <span className="item-main">
                      <strong className="ellipsis">{p.name || 'Unnamed'}</strong>
                      {near(p) < Infinity && <span className="muted small">{formatKm(near(p))} from {place?.name}</span>}
                    </span>
                    <span className="small-btn">＋</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="add-bar">
            <button onClick={() => { setPicking(true); setFilter('') }}>+ Place</button>
            <button onClick={() => addActivity({ title: '' })}>+ Note</button>
          </div>
        )}
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={stop.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything to remember…" />
      </label>

      <div className="row">
        <button onClick={onTrains}>🚆 Direct trains from here · {formatDay(entry.depart)}</button>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Remove ${place?.name || 'this stop'} from the trip? Its things to do go too; the place stays in your list.`)) {
              deleteStop(stop.id)
              onClose()
            }
          }}
        >
          Remove stop
        </button>
      </div>
    </div>
  )
}

const formatKm = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n < 10 ? n.toFixed(1) : Math.round(n)} km`)

function ActivityRow({
  a,
  entry,
  lookup,
  dayOptions,
  dayLabel,
  onShowPlace,
}: {
  a: Activity
  entry: StopEntry
  lookup: Lookup
  dayOptions: (number | null)[]
  dayLabel: (d: number | null) => string
  onShowPlace: (id: string) => void
}) {
  const place = a.placeId ? lookup.places.get(a.placeId) : undefined
  const set = (patch: Partial<Activity>) => saveActivity({ ...a, ...patch })
  const date = activityDate(a, entry)
  return (
    <li className="activity">
      <input
        className="time-input"
        type="time"
        value={a.time}
        onChange={(e) => set({ time: e.target.value })}
        aria-label="Time"
        title={date ? formatDay(date) : 'Time'}
      />
      {place ? (
        <button className="item" onClick={() => onShowPlace(place.id)}>
          <span className="item-icon plain">{CATEGORIES[place.category].icon}</span>
          <span className="item-main">
            <strong className="ellipsis">{place.name || 'Unnamed'}</strong>
          </span>
        </button>
      ) : (
        <input
          className="note-input"
          value={a.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="📝 Note, e.g. laundry"
          autoFocus={!a.title}
        />
      )}
      <select
        className="day-select"
        value={a.day == null ? '' : String(activityDay(a, entry))}
        onChange={(e) => set({ day: e.target.value === '' ? null : Number(e.target.value) })}
        aria-label="Day"
      >
        {dayOptions.map((d) => (
          <option key={String(d)} value={d == null ? '' : String(d)}>
            {d == null ? 'Anytime' : dayLabel(d).split(' · ').slice(0, 2).join(' · ')}
          </option>
        ))}
      </select>
      <button className="icon-btn danger" title="Remove" onClick={() => deleteActivity(a.id)}>
        🗑️
      </button>
    </li>
  )
}
