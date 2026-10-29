import { useState } from 'react'
import { formatEur } from '../budget'
import { CATEGORIES } from '../data/categories'
import { daysBetween, formatDay, formatShort, today as todayDate } from '../dates'
import { search, type GeoResult } from '../geocode'
import { countryNames, useCountries } from '../countries'
import { avoidedOnRoute, legSummary, LINE_KINDS, lineTitle, timeOf } from '../lines'
import { newId, saveLine, savePlace, saveStop, updateSettings } from '../store'
import {
  activityDate,
  appendStop,
  between,
  lineTrains,
  stayName,
  stopEndpoint,
  stopForNight,
  travelDays,
  tripLines,
  tripStops,
  type LineEntry,
  type Lookup,
  type StopEntry,
  type Trip,
  type TripEntry,
} from '../trip'
import type { Activity, Place, Settings, TravelLine } from '../types'
import SortableRows, { type HandleProps } from './SortableRows'

interface Props {
  trip: Trip
  activities: Activity[]
  lookup: Lookup
  settings: Settings
  /** Daily expenses of today in EUR (for the "today" card) */
  spentToday: number
  focusStop: string | null
  highlightId: string | null
  onFocusStop: (id: string | null) => void
  onEditStop: (id: string) => void
  onEditLine: (id: string) => void
  onShowStop: (entry: StopEntry) => void
  onShowLine: (line: TravelLine) => void
  /** Direct trains leaving after `after` (a stop), towards `to`, or for an existing connection */
  onFindTrains: (ctx: { afterId: string; lineId?: string; toStopId?: string }) => void
  onDrawLine: () => void
  onOpenBudget: () => void
  /** Someone's shared trip: look, don't touch (tapping a row opens its details) */
  readOnly?: boolean
}

const gapText = (gap: number) =>
  gap > 0 ? `${gap} unplanned ${gap === 1 ? 'night' : 'nights'} before` : `overlaps by ${-gap} ${gap === -1 ? 'night' : 'nights'}`

const nights = (n: number) => (n === 0 ? 'passing through' : n === 1 ? '1 night' : `${n} nights`)

export default function TripView(props: Props) {
  const { trip, activities, lookup, settings, focusStop, highlightId, readOnly } = props
  const { onFocusStop, onEditStop, onEditLine, onShowStop, onShowLine, onFindTrains } = props
  const [adding, setAdding] = useState(false)
  const stops = tripStops(trip)
  const totalDays = stops.length ? daysBetween(trip.start, trip.end) + 1 : 0
  const used = travelDays(trip)

  function connect(prev: StopEntry, next: StopEntry) {
    const now = Date.now()
    saveLine({
      id: newId(),
      kind: 'plan',
      from: stopEndpoint(prev.stop, lookup),
      to: stopEndpoint(next.stop, lookup),
      notes: '',
      order: between(prev.order, next.order),
      createdAt: now,
      updatedAt: now,
    })
  }

  function move(entry: TripEntry, prev: TripEntry | undefined, next: TripEntry | undefined) {
    const order = between(prev?.order, next?.order)
    if (entry.kind === 'stop') saveStop({ ...entry.stop, order })
    else saveLine({ ...entry.line, order })
  }

  const rowClass = (e: TripEntry) =>
    ['trip-li', e.kind, highlightId === e.id ? 'highlighted' : '', focusStop === e.id ? 'on-map' : ''].join(' ')

  function renderRow(e: TripEntry, handle?: HandleProps) {
    const i = trip.entries.indexOf(e)
    const prev = trip.entries[i - 1]
    const dragHandle = handle && (
      <button ref={handle.ref} className="drag-handle" aria-label="Drag to move" {...handle.attributes} {...handle.listeners}>
        ⠿
      </button>
    )
    if (e.kind === 'line')
      return (
        <div className="trip-entry">
          <div className="trip-row">
            {dragHandle}
            <LineRow e={e} lookup={lookup} onShow={() => onShowLine(e.line)} />
            {!readOnly && (
              <>
                <button
                  className="icon-btn"
                  title={e.line.kind === 'train' ? 'Pick another train' : 'Find a direct train'}
                  onClick={() => prev && onFindTrains({ afterId: prev.id, lineId: e.id })}
                  disabled={!prev}
                >
                  🚆
                </button>
                <button className="icon-btn" title="Edit" onClick={() => onEditLine(e.id)}>✏️</button>
              </>
            )}
          </div>
        </div>
      )
    return (
      <div className="trip-entry">
        {prev?.kind === 'stop' && !readOnly && (
          <div className="connector missing">
            <span className="muted small">How do you get here?</span>
            <button className="small-btn" onClick={() => connect(prev, e)}>🧭 Rough plan</button>
            <button className="small-btn" onClick={() => onFindTrains({ afterId: prev.id, toStopId: e.id })}>
              🚆 Find a train
            </button>
          </div>
        )}
        <div className="trip-row">
          {dragHandle}
          <StopRow e={e} lookup={lookup} activities={activities} onShow={() => onShowStop(e)} />
          {!readOnly && (
            <>
              <button
                className={'icon-btn' + (focusStop === e.id ? ' active' : '')}
                title={focusStop === e.id ? 'Show everything on the map' : 'Show only this stop on the map'}
                onClick={() => onFocusStop(focusStop === e.id ? null : e.id)}
              >
                🗺️
              </button>
              <button className="icon-btn" title="Edit" onClick={() => onEditStop(e.id)}>✏️</button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (adding) return <StopPicker trip={trip} lookup={lookup} onDone={() => setAdding(false)} />

  return (
    <div className="trip">
      <TodayCard {...props} />

      {!readOnly && (
        <div className="row two trip-settings">
          <label className="field">
            <span>Trip starts</span>
            <input
              type="date"
              value={settings.tripStart ?? ''}
              onChange={(e) => updateSettings({ tripStart: e.target.value || null })}
            />
          </label>
          <label className="field">
            <span>Pass travel days</span>
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={settings.passDays ?? ''}
              onChange={(e) => updateSettings({ passDays: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
              placeholder="Continuous pass"
            />
          </label>
        </div>
      )}
      {stops.length > 0 && (
        <p className="small trip-summary">
          {totalDays} {totalDays === 1 ? 'day' : 'days'} · {stops.length} {stops.length === 1 ? 'stop' : 'stops'} ·{' '}
          <span className={settings.passDays && used > settings.passDays ? 'warn-text' : ''}>
            🎫 {used}
            {settings.passDays ? ` of ${settings.passDays}` : ''} travel {used === 1 && !settings.passDays ? 'day' : 'days'}
            {settings.passDays && used > settings.passDays ? ' (more than your pass has)' : ''}
          </span>
          {!trip.dated && <span className="muted"> · no start date yet, so the dates count from today</span>}
        </p>
      )}

      {trip.entries.length === 0 && readOnly && <p className="empty muted">Nothing planned yet.</p>}
      {trip.entries.length === 0 && !readOnly && (
        <p className="empty muted">
          Plan your route as <b>stops</b> (where you sleep, how many nights) and the <b>connections</b> between them.
          Change the nights of one stop and every date after it moves along.
        </p>
      )}

      {readOnly ? (
        <ul className="list">
          {trip.entries.map((e) => (
            <li key={e.id} className={rowClass(e)}>
              {renderRow(e)}
            </li>
          ))}
        </ul>
      ) : (
        <SortableRows items={trip.entries} rowClass={rowClass} onMove={move} renderRow={renderRow} />
      )}

      {!readOnly && (
        <div className="row trip-actions">
          <button className="primary" onClick={() => setAdding(true)}>+ Stop</button>
          <button onClick={props.onDrawLine}>〰️ Draw a connection on the map</button>
        </div>
      )}
      <div className="line-legend">
        {Object.values(LINE_KINDS).map((k) => (
          <span key={k.label} className="small">
            <span className={'line-swatch ' + (k.icon === '🚆' ? 'train' : 'plan')} /> {k.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function StopRow({ e, lookup, activities, onShow }: { e: StopEntry; lookup: Lookup; activities: Activity[]; onShow: () => void }) {
  const place = lookup.places.get(e.stop.placeId)
  const bed = stayName(e.stop, lookup)
  const todo = activities.filter((a) => a.stopId === e.id).length
  const range = e.stop.nights ? `${formatDay(e.arrive)} – ${formatShort(e.depart)}` : formatDay(e.arrive)
  return (
    <button className="item" onClick={onShow}>
      <span className="item-icon stop-icon">{place ? CATEGORIES[place.category].icon : '📍'}</span>
      <span className="item-main">
        <strong className="ellipsis">{place?.name || 'Unnamed'}</strong>
        <span className="muted small ellipsis">
          {range} · {nights(e.stop.nights)}
          {e.stop.fixedDate ? ' · 📌' : ''}
        </span>
        <span className="small ellipsis">
          {e.stop.nights > 0 && (bed ? `🛏️ ${bed}` : <span className="warn-text">🛏️ no bed yet</span>)}
          {todo > 0 && <span className="muted">{e.stop.nights > 0 ? ' · ' : ''}{todo} to do</span>}
        </span>
        {e.gap !== 0 && (
          <span className="warn-text small">
            ⚠ {gapText(e.gap)}
          </span>
        )}
      </span>
    </button>
  )
}

function LineRow({ e, lookup, onShow }: { e: LineEntry; lookup: Lookup; onShow: () => void }) {
  const kind = LINE_KINDS[e.line.kind]
  const t = lineTrains(e.line, lookup)
  const sum = t.legs.length ? legSummary(t.legs) : null
  const shapes = useCountries()
  const stillIn = avoidedOnRoute(e.line, lookup)
  const parts = [
    formatDay(e.date) + (t.departure ? ' ' + timeOf(t.departure) : '') + (e.line.fixedDate ? ' 📌' : ''),
    e.line.overnight ? '🌙 night train' : '',
    t.names.join(' + '),
  ].filter(Boolean)
  return (
    <button className="item" onClick={onShow}>
      <span className="item-icon plain" style={{ boxShadow: `inset 0 -3px 0 ${kind.color}` }}>{kind.icon}</span>
      <span className="item-main">
        <strong className="ellipsis">{lineTitle(e.line, lookup)}</strong>
        <span className="muted small ellipsis">{parts.join(' · ')}</span>
        {(sum || t.reservation || stillIn.length > 0 || e.line.kind === 'plan') && (
          <span className="small ellipsis">
            {sum && <span className={'cov-text ' + sum.tone}>{sum.icon} Interrail</span>}
            {t.reservation && <span className="warn-text"> · ⚠ reservation</span>}
            {stillIn.length > 0 && <span className="warn-text"> · ⚠ through {countryNames(stillIn, shapes)}</span>}
            {e.line.kind === 'plan' && <span className="muted">no train chosen yet</span>}
          </span>
        )}
        {e.gap !== 0 && <span className="warn-text small">⚠ {gapText(e.gap)}</span>}
      </span>
    </button>
  )
}

/** During the trip: tonight's bed, the next train, today's plans and spending */
function TodayCard({ trip, activities, lookup, settings, spentToday, onShowLine, onEditStop, onOpenBudget, readOnly }: Props) {
  const t = todayDate()
  if (!trip.entries.length || !trip.dated) return null
  if (t < trip.start) {
    const n = daysBetween(t, trip.start)
    return (
      <section className="today-card before">
        <strong>
          {n === 1 ? 'Tomorrow it starts!' : `${n} days to go`}
        </strong>
        <span className="muted small"> · first day {formatDay(trip.start)}</span>
      </section>
    )
  }
  if (t > trip.end) return null

  const tonight = stopForNight(trip, t)
  const here = tonight ?? tripStops(trip).find((s) => s.arrive <= t && t <= s.depart) ?? null
  const next = tripLines(trip).find((l) => l.date >= t)
  const nextTrains = next ? lineTrains(next.line, lookup) : null
  const todo = here
    ? activities.filter((a) => a.stopId === here.id && activityDate(a, here) === t)
    : []
  const place = here ? lookup.places.get(here.stop.placeId) : undefined
  const bed = tonight ? stayName(tonight.stop, lookup) : ''
  const over = spentToday > settings.budgetDaily

  return (
    <section className="today-card">
      <div className="today-head">
        <strong>Today</strong>
        <span className="muted small">
          {' '}
          · day {daysBetween(trip.start, t) + 1} of {daysBetween(trip.start, trip.end) + 1}
          {place ? ` · ${place.name}` : ''}
        </span>
      </div>
      <ul className="today-list">
        {tonight ? (
          <li>
            <button className="ghost" onClick={() => onEditStop(tonight.id)}>
              🛏️ Tonight: {bed ? <b>{bed}</b> : <span className="warn-text">no bed planned yet</span>}
            </button>
          </li>
        ) : null}
        {next && (
          <li>
            <button className="ghost" onClick={() => onShowLine(next.line)}>
              🚆 {next.date === t ? 'Today' : formatDay(next.date)}
              {nextTrains?.departure ? ' ' + timeOf(nextTrains.departure) : ''}: <b>{lineTitle(next.line, lookup)}</b>
              {nextTrains?.reservation && <span className="warn-text"> · ⚠ reservation</span>}
              {next.line.kind === 'plan' && <span className="muted"> · no train chosen yet</span>}
            </button>
          </li>
        )}
        {todo.length > 0 && (
          <li className="small">
            📍{' '}
            {todo
              .map((a) => (a.time ? a.time + ' ' : '') + (a.placeId ? lookup.places.get(a.placeId)?.name ?? '' : a.title))
              .join(' · ')}
          </li>
        )}
        {!readOnly && (
          <li>
            <button className="ghost" onClick={onOpenBudget}>
              💶 Spent today: <b className={over ? 'warn-text' : ''}>{formatEur(spentToday)}</b>{' '}
              <span className="muted">of {formatEur(settings.budgetDaily)}</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}

/** Pick (or find) the town of a new stop; it goes at the end of the trip */
function StopPicker({ trip, lookup, onDone }: { trip: Trip; lookup: Lookup; onDone: () => void }) {
  const [filter, setFilter] = useState('')
  const [results, setResults] = useState<GeoResult[] | null>(null)
  const [error, setError] = useState('')
  const q = filter.trim().toLowerCase()
  const inTrip = new Set(tripStops(trip).map((s) => s.stop.placeId))
  const rank = (p: Place) => (p.category === 'city' ? 0 : p.category === 'station' ? 1 : 2)
  const places = [...lookup.places.values()]
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || Number(inTrip.has(a.id)) - Number(inTrip.has(b.id)))

  function addStop(place: Place) {
    appendStop(trip, lookup, place)
    onDone()
  }

  async function find(ev: React.FormEvent) {
    ev.preventDefault()
    if (!filter.trim()) return
    setError('')
    setResults([])
    try {
      setResults(await search(filter))
    } catch {
      setResults(null)
      setError('Searching needs an internet connection. Your own places work offline.')
    }
  }

  function addFromSearch(r: GeoResult) {
    const now = Date.now()
    const place: Place = {
      id: newId(),
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      category: 'city',
      status: 'idea',
      notes: '',
      url: '',
      createdAt: now,
      updatedAt: now,
    }
    savePlace(place)
    addStop(place)
  }

  return (
    <div className="picker">
      <div className="editor-head">
        <button className="ghost" onClick={onDone}>← Back</button>
        <span className="muted">New stop at the end of the trip</span>
      </div>
      <form className="search" onSubmit={find}>
        <input
          type="search"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            if (!e.target.value) setResults(null)
          }}
          placeholder="Town, e.g. Ljubljana"
          autoFocus
        />
        <button type="submit">Search</button>
      </form>
      {error && <p className="muted small">{error}</p>}
      {results && (
        <>
          <h4>Found</h4>
          <ul className="list">
            {results.length === 0 && <li className="empty">Searching…</li>}
            {results.map((r, i) => (
              <li key={i}>
                <button className="item" onClick={() => addFromSearch(r)}>
                  <span className="item-icon plain">🏙️</span>
                  <span className="item-main">
                    <strong>{r.name}</strong>
                    <span className="muted small ellipsis">{r.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Your places</h4>
      <ul className="list">
        {places.length === 0 && <li className="empty">No matching places. Search above to find a town.</li>}
        {places.map((p) => (
          <li key={p.id}>
            <button className="item" onClick={() => addStop(p)}>
              <span className="item-icon plain">{CATEGORIES[p.category].icon}</span>
              <span className="item-main">
                <strong>{p.name || 'Unnamed'}</strong>
                {inTrip.has(p.id) && <span className="muted small">already a stop (you can come back)</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
