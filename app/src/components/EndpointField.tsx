import { useState } from 'react'
import { CATEGORIES } from '../data/categories'
import { search, type GeoResult } from '../geocode'
import { resolveEndpoint } from '../lines'
import { searchStations, type Station } from '../rail/transitous'
import type { Lookup } from '../trip'
import type { Endpoint, Place } from '../types'

interface Props {
  label: string
  value: Endpoint
  lookup: Lookup
  /** Places to offer first (the stops this connection joins) */
  suggested: string[]
  onChange: (e: Endpoint) => void
  onPickOnMap: () => void
}

/** Start or end of a connection: type to find a place / station / town, or tap it on the map */
export default function EndpointField({ label, value, lookup, suggested, onChange, onPickOnMap }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [found, setFound] = useState<{ stations: Station[]; towns: GeoResult[] } | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const current = resolveEndpoint(value, lookup)
  const linked = value.placeId ? lookup.places.get(value.placeId) : undefined

  const q = text.trim().toLowerCase()
  const rank = (p: Place) => (suggested.includes(p.id) ? 0 : p.category === 'station' ? 1 : p.category === 'city' ? 2 : 3)
  const own = [...lookup.places.values()]
    .filter((p) => p.id !== value.placeId && (q ? p.name.toLowerCase().includes(q) : rank(p) < 3))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 8)

  function choose(e: Endpoint) {
    onChange(e)
    setOpen(false)
    setText('')
    setFound(null)
  }

  async function find(ev: React.FormEvent) {
    ev.preventDefault()
    if (!q) return
    setSearching(true)
    setError('')
    // Stations from the journey planner, towns and addresses from the map
    const [stations, towns] = await Promise.all([searchStations(text).catch(() => null), search(text).catch(() => null)])
    setSearching(false)
    if (!stations && !towns) setError('Searching needs an internet connection. Your own places work offline.')
    setFound({ stations: (stations ?? []).slice(0, 6), towns: towns ?? [] })
  }

  return (
    <div className="endpoint-field">
      <div className="endpoint-row">
        <span className="endpoint-label muted small">{label}</span>
        <span className="endpoint-name ellipsis">
          {linked ? CATEGORIES[linked.category].icon : '📍'} {current.name || '?'}
        </span>
        <button className="small-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          ✏️ Change
        </button>
        <button className="small-btn" onClick={onPickOnMap} title={`Tap the new ${label.toLowerCase()} on the map`}>
          📍 On map
        </button>
      </div>
      {open && (
        <div className="endpoint-picker">
          <form className="search" onSubmit={find}>
            <input
              type="search"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (!e.target.value) setFound(null)
              }}
              placeholder="Station, town or one of your places"
              autoFocus
            />
            <button type="submit" disabled={searching}>
              {searching ? '…' : 'Search'}
            </button>
          </form>
          {error && <p className="muted small">{error}</p>}
          <ul className="list">
            {own.map((p) => (
              <li key={p.id}>
                <button className="item" onClick={() => choose({ placeId: p.id, name: p.name, lat: p.lat, lng: p.lng })}>
                  <span className="item-icon plain">{CATEGORIES[p.category].icon}</span>
                  <span className="item-main">
                    <strong className="ellipsis">{p.name}</strong>
                    <span className="muted small">{suggested.includes(p.id) ? 'Stop of your trip' : 'Your place'}</span>
                  </span>
                </button>
              </li>
            ))}
            {found?.stations.map((s) => (
              <li key={'s' + (s.stopId ?? s.name)}>
                <button className="item" onClick={() => choose({ name: s.name, lat: s.lat, lng: s.lng })}>
                  <span className="item-icon plain">🚉</span>
                  <span className="item-main">
                    <strong className="ellipsis">{s.name}</strong>
                    <span className="muted small">Station</span>
                  </span>
                </button>
              </li>
            ))}
            {found?.towns.map((t, i) => (
              <li key={'t' + i}>
                <button className="item" onClick={() => choose({ name: t.name, lat: t.lat, lng: t.lng })}>
                  <span className="item-icon plain">🏙️</span>
                  <span className="item-main">
                    <strong className="ellipsis">{t.name}</strong>
                    <span className="muted small ellipsis">{t.label}</span>
                  </span>
                </button>
              </li>
            ))}
            {found && !found.stations.length && !found.towns.length && !error && <li className="empty">Nothing found.</li>}
            {!found && q && <li className="empty">Press Search to look for stations and towns.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
