import { useState } from 'react'
import { formatDay } from '../dates'
import { km } from '../trip'
import {
  formatMinutes,
  searchStations,
  TRANSITOUS_SOURCES,
  type Destination,
  type DirectQuery,
  type DirectResult,
  type Station,
} from '../rail/transitous'
import type { Place, Settings } from '../types'
import { updateSettings } from '../store'
import { coverage, COVERAGE_LABEL } from '../data/interrailOperators'
import { timeOf } from '../lines'
import type { DirectTrainInfo } from '../rail/transitous'

interface Props {
  origin: Station | null
  query: DirectQuery
  result: DirectResult | null
  loading: boolean
  error: string
  /** Stations and cities from the user's places, for one-tap picks */
  places: Place[]
  highlight: string | null
  onOrigin: (s: Station | null) => void
  onOriginFromPlace: (p: Place) => void
  onQuery: (q: DirectQuery) => void
  onShow: (d: Destination) => void
  onAddPlace: (d: Destination) => void
  /** Put this train into the trip (what exactly depends on `context`) */
  onAddToTrip: (d: Destination) => void
  /** Opened for a part of the trip */
  context: TrainsContext | null
  onClearContext: () => void
  trainInfo: Record<string, DirectTrainInfo | null | 'loading' | 'error'>
  settings: Settings
}

export interface TrainsContext {
  /** Trip entry the new connection goes after */
  afterId: string | null
  /** Existing connection that gets this train */
  lineId?: string
  /** Next stop: the new connection leads there */
  toStopId?: string
  label: string
  /** Where you want to go, to list the stations near it first */
  target: { name: string; lat: number; lng: number } | null
  travelDate: string
  /** The travel day is too far ahead (or past), so a typical weekday is searched instead */
  typical: boolean
}

/** Stations this close to the target count as "there" */
const NEAR_TARGET_KM = 25

const SLOTS = [
  { hour: 6, label: 'Morning', hint: 'from 06:00' },
  { hour: 12, label: 'Midday', hint: 'from 12:00' },
  { hour: 18, label: 'Evening', hint: 'from 18:00, incl. night trains' },
]
const HOURS = [4, 8, 12]
/** Transitous "importance" above which a stop counts as a main station (cities, junctions) */
const MAIN_STATION = 0.002

/** The train to a destination with its Interrail coverage (after the destination was tapped) */
function TrainInfoLine({ info }: { info: DirectTrainInfo | null | 'loading' | 'error' | undefined }) {
  if (info === undefined) return null
  if (info === 'loading') return <span className="muted small">Checking the train…</span>
  if (info === 'error') return <span className="muted small">Couldn't check the train (offline?)</span>
  if (info === null) return <span className="muted small">No single train found for this time</span>
  const c = COVERAGE_LABEL[coverage(info.agency, info.mode)]
  return (
    <span className="small train-info">
      <span className={'cov-badge ' + c.tone}>
        {c.icon} {c.text}
      </span>{' '}
      {timeOf(info.departure)} {info.name} · {info.agency}
      {info.reservation ? ' · ⚠ reservation required' : ''}
    </span>
  )
}

export default function TrainsView({
  origin,
  query,
  result,
  loading,
  error,
  places,
  highlight,
  onOrigin,
  onOriginFromPlace,
  onQuery,
  onShow,
  onAddPlace,
  onAddToTrip,
  context,
  onClearContext,
  trainInfo,
  settings,
}: Props) {
  const [text, setText] = useState('')
  const [stations, setStations] = useState<Station[] | null>(null)
  const [searchError, setSearchError] = useState('')
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [mainOnly, setMainOnly] = useState(true)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSearchError('')
    setStations([])
    try {
      setStations(await searchStations(text.trim()))
    } catch {
      setStations(null)
      setSearchError('Station search needs an internet connection.')
    }
  }

  const quickPicks = places.filter((p) => p.category === 'station' || p.category === 'city').slice(0, 10)
  const f = filter.trim().toLowerCase()
  const list =
    result?.destinations.filter(
      (d) => (!mainOnly || d.importance >= MAIN_STATION) && (!f || d.name.toLowerCase().includes(f)),
    ) ?? []
  const mainCount = result?.destinations.filter((d) => d.importance >= MAIN_STATION).length ?? 0
  const LIMIT = 150
  const target = context?.target
  const nearTarget = target ? list.filter((d) => km(d, target) <= NEAR_TARGET_KM) : []
  const rest = target ? list.filter((d) => km(d, target) > NEAR_TARGET_KM) : list
  const shown = showAll ? rest : rest.slice(0, LIMIT)
  const tripLabel = context?.lineId || context?.toStopId ? 'Use this train' : 'Add to the trip (with a new stop there)'

  const row = (d: Destination) => (
    <li key={d.stopId} className={highlight === d.stopId ? 'highlighted' : ''}>
      <button className="item" onClick={() => onShow(d)}>
        <span className="item-time reach-time">{formatMinutes(d.minutes)}</span>
        <span className="item-main">
          <strong className="ellipsis">{d.name}</strong>
          {d.arrival && <span className="muted small">arrives {timeOf(d.arrival)}</span>}
          <TrainInfoLine info={trainInfo[d.stopId]} />
        </span>
      </button>
      <button
        className="icon-btn"
        title="Direct trains from here"
        onClick={() => onOrigin({ name: d.name, lat: d.lat, lng: d.lng, stopId: d.stopId })}
      >
        🚆
      </button>
      <button className="icon-btn" title="Add to places" onClick={() => onAddPlace(d)}>
        📍
      </button>
      <button className="small-btn trip-add" title={tripLabel} onClick={() => onAddToTrip(d)}>
        {context?.lineId || context?.toStopId ? 'Use' : '＋ Trip'}
      </button>
    </li>
  )
  const slot = SLOTS.find((s) => s.hour === query.hour) ?? SLOTS[0]

  return (
    <div className="trains">
      {context && (
        <div className="trip-context">
          <div className="item-main">
            <span className="muted small">For your trip</span>
            <strong className="ellipsis">{context.label}</strong>
            <span className="small">
              {formatDay(context.travelDate)}
              {context.typical && (
                <span className="muted"> · searching a typical weekday ({formatDay(query.date)}): timetables don't cover your travel day yet</span>
              )}
            </span>
          </div>
          <button className="icon-btn" title="Not for the trip, just exploring" onClick={onClearContext}>✕</button>
        </div>
      )}
      <form className="search" onSubmit={search}>
        <input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (!e.target.value) setStations(null)
          }}
          placeholder="Station, e.g. Wien Hbf"
        />
        <button type="submit">Search</button>
      </form>
      {searchError && <p className="muted small">{searchError}</p>}

      {stations && (
        <ul className="list results">
          {stations.length === 0 && <li className="empty">Searching…</li>}
          {stations.map((s) => (
            <li key={s.stopId ?? s.name}>
              <button
                className="item"
                onClick={() => {
                  onOrigin(s)
                  setStations(null)
                  setText('')
                }}
              >
                <span className="item-icon plain">🚉</span>
                <span className="item-main">
                  <strong>{s.name}</strong>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button className="ghost small" onClick={() => setStations(null)}>Close</button>
          </li>
        </ul>
      )}

      {!origin && error && <p className="error-text small">{error}</p>}
      {!origin && !stations && (
        <>
          <p className="muted small intro">
            Pick a station to see <b>every place you can reach without changing trains</b>. You can also tap a station
            or city on the map and choose <b>🚆 Direct trains</b>.
          </p>
          {quickPicks.length > 0 && (
            <div className="field">
              <span>From your places</span>
              <div className="chips">
                {quickPicks.map((p) => (
                  <button key={p.id} className="chip" onClick={() => onOriginFromPlace(p)}>
                    {p.category === 'station' ? '🚉' : '🏙️'} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {origin && (
        <>
          <div className="origin-card">
            <span className="origin-dot" />
            <div className="item-main">
              <span className="muted small">Direct trains from</span>
              <strong>{origin.name}</strong>
            </div>
            <button className="icon-btn" title="Clear" onClick={() => onOrigin(null)}>✕</button>
          </div>

          <div className="train-options">
            <label className="field">
              <span>Day</span>
              <input type="date" value={query.date} onChange={(e) => e.target.value && onQuery({ ...query, date: e.target.value })} />
            </label>
            <div className="field">
              <span>Leaving</span>
              <div className="segmented">
                {SLOTS.map((s) => (
                  <button
                    key={s.hour}
                    className={query.hour === s.hour ? 'active' : ''}
                    title={s.hint}
                    onClick={() => onQuery({ ...query, hour: s.hour })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Up to</span>
              <div className="segmented">
                {HOURS.map((h) => (
                  <button key={h} className={query.maxHours === h ? 'active' : ''} onClick={() => onQuery({ ...query, maxHours: h })}>
                    {h} h
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.reachFocus}
                onChange={() => updateSettings({ reachFocus: !settings.reachFocus })}
              />
              Fade the rest of the map
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={query.noReservation}
                onChange={(e) => onQuery({ ...query, noReservation: e.target.checked })}
              />
              Only trains without compulsory reservation
            </label>
          </div>

          {loading && <p className="muted">Looking up timetables…</p>}
          {error && <p className="error-text small">{error}</p>}

          {result && !loading && (
            <>
              <p className="small reach-summary">
                <b>{mainCount}</b> main stations ({result.destinations.length} stops in total) without changing ·{' '}
                {formatDay(query.date)}, {slot.hint}
              </p>
              <div className="legend">
                <span className="legend-bar" />
                <span className="muted small">close → far</span>
              </div>
              <div className="row list-head">
                <input className="filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter stations" />
                <label className="check small">
                  <input type="checkbox" checked={mainOnly} onChange={(e) => setMainOnly(e.target.checked)} />
                  Main stations only
                </label>
              </div>
              {target && (
                <>
                  <h4 className="near-head">Near {target.name}</h4>
                  <ul className="list">
                    {nearTarget.length === 0 && (
                      <li className="empty">
                        No direct train to {target.name} at this time. Try another time of day, or look at the stations
                        below for a change on the way.
                      </li>
                    )}
                    {nearTarget.map(row)}
                  </ul>
                  <h4 className="near-head">Everywhere else</h4>
                </>
              )}
              <ul className="list">{shown.map(row)}</ul>
              {rest.length > shown.length && (
                <button className="ghost" onClick={() => setShowAll(true)}>
                  Show all {rest.length}
                </button>
              )}
            </>
          )}
        </>
      )}

      <p className="muted small attribution">
        Times are counted from the chosen departure time, so they include waiting for the first train. Timetables:{' '}
        <a href="https://transitous.org" target="_blank" rel="noreferrer">Transitous</a> (
        <a href={TRANSITOUS_SOURCES} target="_blank" rel="noreferrer">data sources</a>). Coverage depends on which
        timetables are published, so a few routes may be missing. Not live: check the operator before you travel.
      </p>
    </div>
  )
}
