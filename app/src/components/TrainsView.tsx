import { useState } from 'react'
import { formatDay } from '../dates'
import {
  formatMinutes,
  searchStations,
  TRANSITOUS_SOURCES,
  type Destination,
  type DirectQuery,
  type DirectResult,
  type Station,
} from '../rail/transitous'
import type { Place } from '../types'

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
  onAdd: (d: Destination) => void
}

const SLOTS = [
  { hour: 6, label: 'Morning', hint: 'from 06:00' },
  { hour: 12, label: 'Midday', hint: 'from 12:00' },
  { hour: 18, label: 'Evening', hint: 'from 18:00, incl. night trains' },
]
const HOURS = [4, 8, 12]
/** Transitous "importance" above which a stop counts as a main station (cities, junctions) */
const MAIN_STATION = 0.002

const timeOf = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

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
  onAdd,
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
  const shown = showAll ? list : list.slice(0, LIMIT)
  const slot = SLOTS.find((s) => s.hour === query.hour) ?? SLOTS[0]

  return (
    <div className="trains">
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
              <ul className="list">
                {shown.map((d) => (
                  <li key={d.stopId} className={highlight === d.stopId ? 'highlighted' : ''}>
                    <button className="item" onClick={() => onShow(d)}>
                      <span className="item-time reach-time">{formatMinutes(d.minutes)}</span>
                      <span className="item-main">
                        <strong className="ellipsis">{d.name}</strong>
                        {d.arrival && <span className="muted small">arrives {timeOf(d.arrival)}</span>}
                      </span>
                    </button>
                    <button
                      className="icon-btn"
                      title="Direct trains from here"
                      onClick={() => onOrigin({ name: d.name, lat: d.lat, lng: d.lng, stopId: d.stopId })}
                    >
                      🚆
                    </button>
                    <button className="icon-btn" title="Add to places" onClick={() => onAdd(d)}>
                      ＋
                    </button>
                  </li>
                ))}
              </ul>
              {list.length > shown.length && (
                <button className="ghost" onClick={() => setShowAll(true)}>
                  Show all {list.length}
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
