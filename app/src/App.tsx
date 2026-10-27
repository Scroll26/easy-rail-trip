import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapView, { type PickHit } from './components/MapView'
import LinesView, { LineEditor } from './components/LinesView'
import { drawnLines, resolveEndpoint } from './lines'
import PlaceEditor from './components/PlaceEditor'
import PersonEditor from './components/PersonEditor'
import SettingsView from './components/SettingsView'
import TimelineView from './components/TimelineView'
import ItemEditor from './components/ItemEditor'
import CollectionView from './components/CollectionView'
import MapToolbar from './components/MapToolbar'
import { countryAt, useCountries } from './countries'
import { useRates } from './rates'
import { useBottomSheet } from './useBottomSheet'
import { SyncChip } from './components/SyncSection'
import TrainsView from './components/TrainsView'
import { directTrains, findStation, type Destination, type DirectQuery, type DirectResult, type Station } from './rail/transitous'
import { addDays } from './dates'
import { describeItem, newItem, trainLeg, type Lookup } from './timeline'
import { reverse, search, type GeoResult } from './geocode'
import {
  deletePerson,
  deletePlace,
  getPerson,
  getPlace,
  newId,
  savePerson,
  saveItem,
  savePlace,
  saveLine,
  updateSettings,
  useDays,
  useLines,
  useGroups,
  usePeople,
  usePlaces,
  useSettings,
  useTimeline,
} from './store'
import type { Endpoint, Person, Place, PlaceCategory, Selection, Settings, TimelineItem, TravelLine } from './types'

type Tab = 'places' | 'people' | 'timeline' | 'trains' | 'settings'

/** Next Wednesday: a normal weekday, so the timetable isn't a weekend one */
function nextWeekday() {
  const d = new Date()
  d.setDate(d.getDate() + (((3 - d.getDay() + 7) % 7) || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
type Pick =
  | { kind: 'new-place' }
  | { kind: 'move-place'; id: string }
  | { kind: 'person'; id: string }
  | { kind: 'line-start' }
  | { kind: 'line-end'; from: Endpoint; fromStation: boolean }
  | null

const NEW_PLACE_NAME = 'New place'

export default function App() {
  const places = usePlaces()
  const people = usePeople()
  const settings = useSettings()
  const timeline = useTimeline()
  const days = useDays()
  const groups = useGroups()
  const lines = useLines()
  const shapes = useCountries()
  const rates = useRates(settings.showCurrencies)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const [tab, setTab] = useState<Tab>('places')
  // selection = item open in the editor; highlight = item marked on the map
  const [selection, setSelection] = useState<Selection>(null)
  const [highlight, setHighlight] = useState<Selection>(null)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [highlightItem, setHighlightItem] = useState<string | null>(null)
  /** Day shown alone on the map (timeline map button) */
  const [mapDay, setMapDay] = useState<string | null>(null)
  const [placesView, setPlacesView] = useState<'places' | 'lines'>('places')
  const [editingLine, setEditingLine] = useState<string | null>(null)
  const [lineHighlight, setLineHighlight] = useState<string | null>(null)
  // Direct trains
  const [trainsOrigin, setTrainsOrigin] = useState<Station | null>(null)
  const [trainsQuery, setTrainsQuery] = useState<DirectQuery>(() => ({
    date: nextWeekday(),
    hour: 6,
    maxHours: 8,
    noReservation: false,
  }))
  const [trainsResult, setTrainsResult] = useState<DirectResult | null>(null)
  const [trainsLoading, setTrainsLoading] = useState(false)
  const [trainsError, setTrainsError] = useState('')
  const [reachHighlight, setReachHighlight] = useState<string | null>(null)
  const [pick, setPick] = useState<Pick>(null)
  const sheet = useBottomSheet()
  const setSheetOpen = sheet.setOpen
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[] | null>(null)
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)

  const flyTo = (lng: number, lat: number, zoom = 13) =>
    mapRef.current?.flyTo({ center: [lng, lat], zoom: Math.max(zoom, mapRef.current.getZoom()) })

  // Country of every place / person, worked out offline from the borders file
  const countryOf = useMemo(() => {
    const m = new Map<string, { iso: string; name: string }>()
    if (!shapes.length) return m
    for (const p of [...places, ...people]) {
      if (p.lat == null || p.lng == null) continue
      const c = countryAt(shapes, p.lat, p.lng)
      if (c) m.set(p.id, { iso: c.iso, name: c.name })
    }
    return m
  }, [shapes, places, people])

  const ratesNote = rates
    ? `rates ${new Date(rates.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : settings.showCurrencies
      ? 'loading rates…'
      : null

  const lookup: Lookup = useMemo(
    () => ({ places: new Map(places.map((p) => [p.id, p])), people: new Map(people.map((p) => [p.id, p])) }),
    [places, people],
  )

  // Stops of the focused day, numbered in timeline order (incl. a stay continuing from an earlier day)
  const focus = useMemo(() => {
    if (!mapDay) return null
    const nums = new Map<string, number>()
    const continuing = timeline.filter(
      (i) => i.type === 'stay' && i.date && i.date < mapDay && addDays(i.date, i.nights) > mapDay,
    )
    for (const item of [...continuing, ...timeline.filter((i) => i.date === mapDay)]) {
      const key = describeItem(item, lookup).markerKey
      if (key && !nums.has(key)) nums.set(key, nums.size + 1)
    }
    return nums
  }, [mapDay, timeline, lookup])

  const travel = useMemo(() => drawnLines(lines, lookup), [lines, lookup])

  // Simple view: only pins + names, country names and travel lines
  const mapSettings: Settings = useMemo(
    () =>
      settings.simpleView
        ? {
            ...settings,
            interrailMode: 'off',
            showRailways: false,
            showStreets: false,
            showCurrencies: false,
            mapLabels: 'countries',
            showPlaceLabels: true,
            showPeopleLabels: true,
            showTravelLines: true,
          }
        : settings,
    [settings],
  )

  const legs = useMemo(
    () =>
      timeline
        .filter((i) => i.type === 'train' && (!mapDay || i.date === mapDay))
        .map(trainLeg)
        .filter((l) => l !== null),
    [timeline, mapDay],
  )

  // Zoom to the focused day
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapDay || !focus) return
    const bounds = new maplibregl.LngLatBounds()
    for (const key of focus.keys()) {
      const [kind, id] = key.split(':')
      const item = kind === 'place' ? lookup.places.get(id) : lookup.people.get(id)
      if (item?.lat != null && item.lng != null) bounds.extend([item.lng, item.lat])
    }
    for (const leg of legs) for (const c of leg) bounds.extend(c)
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
    // Only when the chosen day changes, not on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapDay])

  // Look up direct trains whenever the station or the options change
  useEffect(() => {
    if (!trainsOrigin) {
      setTrainsResult(null)
      return
    }
    let cancelled = false
    setTrainsLoading(true)
    setTrainsError('')
    directTrains(trainsOrigin, trainsQuery)
      .then((r) => {
        if (cancelled) return
        setTrainsResult(r)
        if (r.destinations.length === 0)
          setTrainsError('No direct trains found. Try another time of day, a longer trip, or a nearby bigger station.')
      })
      .catch((e: Error) => {
        if (cancelled) return
        setTrainsResult(null)
        setTrainsError(navigator.onLine ? e.message : 'Timetables need an internet connection (lookups you did before still work).')
      })
      .finally(() => !cancelled && setTrainsLoading(false))
    return () => {
      cancelled = true
    }
  }, [trainsOrigin, trainsQuery])

  function showTrains(origin: Station) {
    setTrainsError('')
    setTrainsOrigin(origin)
    setReachHighlight(null)
    setSelection(null)
    setEditingItem(null)
    setTab('trains')
    setSheetOpen(true)
  }

  /** From a tapped station (exact spot) or a city/place (its main station, found by name) */
  async function trainsFrom(name: string, lat: number, lng: number, isStation: boolean) {
    if (isStation) {
      showTrains({ name, lat, lng })
      return
    }
    setTab('trains')
    setSheetOpen(true)
    setTrainsLoading(true)
    try {
      const station = await findStation(name, lat, lng)
      if (station) {
        showTrains(station)
        return
      }
      setTrainsOrigin(null)
      setTrainsLoading(false)
      setTrainsError(`No trains stop at or near ${name}.`)
    } catch {
      // Offline or lookup failed: try from the place itself
      showTrains({ name, lat, lng })
    }
  }

  function showDestination(d: Destination) {
    setReachHighlight(d.stopId)
    if (window.matchMedia('(max-width: 799px)').matches) setSheetOpen(false)
    mapRef.current?.flyTo({ center: [d.lng, d.lat], zoom: Math.max(9, mapRef.current.getZoom()) })
  }

  function select(sel: Selection) {
    setSelection(sel)
    setHighlight(sel)
    setEditingItem(null)
    if (!sel) setHighlightItem(null)
    setPick(null)
    if (!sel) return
    setTab(sel.kind === 'place' ? 'places' : 'people')
    setSheetOpen(true)
  }

  /** Show an item on the map without opening its editor */
  function showOnMap(sel: NonNullable<Selection>) {
    setHighlight(sel)
    const item = sel.kind === 'place' ? getPlace(sel.id) : getPerson(sel.id)
    if (item?.lat == null || item.lng == null) return
    // On the phone, get the sheet out of the way so the pin is visible
    if (window.matchMedia('(max-width: 799px)').matches) setSheetOpen(false)
    flyTo(item.lng, item.lat)
  }

  /** Timeline row click: mark it and show it on the map */
  function showItem(item: TimelineItem) {
    setHighlightItem(item.id)
    const v = describeItem(item, lookup)
    if (v.markerKey) {
      const [kind, id] = v.markerKey.split(':')
      showOnMap({ kind: kind as 'place' | 'person', id })
      return
    }
    const leg = trainLeg(item)
    if (!leg) return
    if (window.matchMedia('(max-width: 799px)').matches) setSheetOpen(false)
    mapRef.current?.fitBounds(new maplibregl.LngLatBounds(leg[0], leg[0]).extend(leg[1]), { padding: 80 })
  }

  function editItem(id: string) {
    setSelection(null)
    setEditingItem(id)
    setHighlightItem(id)
    setSheetOpen(true)
  }

  function addPlaceToTimeline(placeId: string) {
    const item = newItem('place', null, { placeId })
    saveItem(item)
    setTab('timeline')
    editItem(item.id)
  }

  function confirmDelete(sel: NonNullable<Selection>, name: string) {
    const linked = timeline.filter((i) => (sel.kind === 'place' ? i.placeId : i.personId) === sel.id).length
    const extra = linked ? ` It's also removed from ${linked} timeline entries.` : ''
    if (!confirm(`Delete "${name || 'Unnamed'}"?${extra} This can't be undone.`)) return
    if (sel.kind === 'place') deletePlace(sel.id)
    else deletePerson(sel.id)
    if (highlight?.id === sel.id) setHighlight(null)
  }

  function createPlace(lat: number, lng: number, name = NEW_PLACE_NAME, category: PlaceCategory = 'sight') {
    const now = Date.now()
    const place: Place = {
      id: newId(),
      name,
      lat,
      lng,
      category,
      status: 'idea',
      notes: '',
      url: '',
      createdAt: now,
      updatedAt: now,
    }
    savePlace(place)
    select({ kind: 'place', id: place.id })
    return place
  }

  function createPerson() {
    const now = Date.now()
    const person: Person = {
      id: newId(),
      name: '',
      city: '',
      address: '',
      precision: 'city',
      lat: null,
      lng: null,
      contact: '',
      notes: '',
      canStay: false,
      createdAt: now,
      updatedAt: now,
    }
    savePerson(person)
    select({ kind: 'person', id: person.id })
  }

  /** A line end from what was tapped: a pin, a station / town label, or a bare point */
  async function endpointFor(lat: number, lng: number, hit?: PickHit): Promise<Endpoint> {
    if (hit?.placeId) return resolveEndpoint({ placeId: hit.placeId, name: '', lat, lng }, lookup)
    if (hit?.personId) return resolveEndpoint({ personId: hit.personId, name: '', lat, lng }, lookup)
    if (hit?.name) return { name: hit.name, lat, lng }
    const r = await reverse(lat, lng, 10).catch(() => null)
    return { name: r?.name ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng }
  }

  async function handlePick(lat: number, lng: number, hit?: PickHit) {
    if (!pick) return
    if (pick.kind === 'line-start') {
      setPick({ kind: 'line-end', from: await endpointFor(lat, lng, hit), fromStation: !!hit?.station })
      return
    }
    if (pick.kind === 'line-end') {
      setPick(null)
      setSheetOpen(true)
      const to = await endpointFor(lat, lng, hit)
      const now = Date.now()
      const line: TravelLine = {
        id: newId(),
        // Station to station is a train connection; anything else a general plan
        kind: pick.fromStation && hit?.station ? 'train' : 'plan',
        from: pick.from,
        to,
        notes: '',
        createdAt: now,
        updatedAt: now,
      }
      saveLine(line)
      setTab('places')
      setPlacesView('lines')
      setSelection(null)
      setEditingItem(null)
      setEditingLine(line.id)
      setLineHighlight(line.id)
      return
    }
    setPick(null)
    setSheetOpen(true)
    if (pick.kind === 'new-place') {
      const place = createPlace(lat, lng)
      // Suggest a name from the map; keep it only if the user hasn't typed one yet
      const hit = await reverse(lat, lng).catch(() => null)
      const current = getPlace(place.id)
      if (hit && current && current.name === NEW_PLACE_NAME) savePlace({ ...current, name: hit.name })
    } else if (pick.kind === 'move-place') {
      const p = getPlace(pick.id)
      if (p) savePlace({ ...p, lat, lng })
    } else {
      const p = getPerson(pick.id)
      if (p) savePerson({ ...p, lat, lng })
    }
  }

  function startPick(p: Pick) {
    setPick(p)
    setSheetOpen(false)
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearchError('')
    setResults([])
    setSearching(true)
    try {
      setResults(await search(query))
    } catch {
      setResults(null)
      setSearchError('Search needs an internet connection.')
    } finally {
      setSearching(false)
    }
  }

  const editedItem = editingItem ? timeline.find((i) => i.id === editingItem) : undefined
  const editedLine = editingLine ? lines.find((l) => l.id === editingLine) : undefined

  function editLine(id: string) {
    setSelection(null)
    setEditingItem(null)
    setEditingLine(id)
    setLineHighlight(id)
    setTab('places')
    setPlacesView('lines')
    setSheetOpen(true)
  }

  function showLine(line: TravelLine) {
    setLineHighlight(line.id)
    const a = resolveEndpoint(line.from, lookup)
    const b = resolveEndpoint(line.to, lookup)
    if (window.matchMedia('(max-width: 799px)').matches) setSheetOpen(false)
    mapRef.current?.fitBounds(new maplibregl.LngLatBounds([a.lng, a.lat], [a.lng, a.lat]).extend([b.lng, b.lat]), {
      padding: 100,
      maxZoom: 11,
    })
  }
  const selectedPlace = selection?.kind === 'place' ? places.find((p) => p.id === selection.id) : undefined
  const selectedPerson = selection?.kind === 'person' ? people.find((p) => p.id === selection.id) : undefined


  let body: React.ReactNode
  if (editedLine) body = <LineEditor line={editedLine} lookup={lookup} onClose={() => setEditingLine(null)} />
  else if (editedItem)
    body = (
      <ItemEditor
        item={editedItem}
        items={timeline}
        lookup={lookup}
        onClose={() => setEditingItem(null)}
        onOpenPlace={(id) => select({ kind: 'place', id })}
      />
    )
  else if (selectedPlace)
    body = (
      <PlaceEditor
        place={selectedPlace}
        scheduled={timeline.filter((i) => i.placeId === selectedPlace.id)}
        onClose={() => setSelection(null)}
        onMove={() => startPick({ kind: 'move-place', id: selectedPlace.id })}
        onTrains={() => trainsFrom(selectedPlace.name, selectedPlace.lat, selectedPlace.lng, selectedPlace.category === 'station')}
        onAddToTimeline={() => addPlaceToTimeline(selectedPlace.id)}
        onOpenItem={(id) => {
          setTab('timeline')
          editItem(id)
        }}
      />
    )
  else if (selectedPerson)
    body = (
      <PersonEditor
        person={selectedPerson}
        onClose={() => setSelection(null)}
        onPickOnMap={() => startPick({ kind: 'person', id: selectedPerson.id })}
        onLocated={(lat, lng) => flyTo(lng, lat, 10)}
      />
    )
  else if (tab === 'settings') body = <SettingsView settings={settings} />
  else if (tab === 'trains')
    body = (
      <TrainsView
        origin={trainsOrigin}
        query={trainsQuery}
        result={trainsResult}
        loading={trainsLoading}
        error={trainsError}
        places={places}
        highlight={reachHighlight}
        onOrigin={(s) => (s ? showTrains(s) : setTrainsOrigin(null))}
        onOriginFromPlace={(p) => trainsFrom(p.name, p.lat, p.lng, p.category === 'station')}
        onQuery={setTrainsQuery}
        onShow={showDestination}
        onAdd={(d) => {
          setTab('places')
          createPlace(d.lat, d.lng, d.name, 'station')
        }}
      />
    )
  else if (tab === 'timeline')
    body = (
      <TimelineView
        items={timeline}
        days={days}
        lookup={lookup}
        mapDay={mapDay}
        highlightId={highlightItem}
        onMapDay={setMapDay}
        onEdit={editItem}
        onShow={showItem}
      />
    )
  else
    body = (
      <>
        {tab === 'places' && (
          <div className="segmented view-switch">
            <button className={placesView === 'places' ? 'active' : ''} onClick={() => setPlacesView('places')}>
              📍 Places ({places.length})
            </button>
            <button className={placesView === 'lines' ? 'active' : ''} onClick={() => setPlacesView('lines')}>
              〰️ Travel lines ({lines.length})
            </button>
          </div>
        )}
        {!(tab === 'places' && placesView === 'lines') && (
          <>
          <form className="search" onSubmit={runSearch}>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (!e.target.value) setResults(null)
              }}
              placeholder="Search a city, sight, address…"
            />
            <button type="submit">Search</button>
          </form>
          {searchError && <p className="muted small">{searchError}</p>}
          {results && (
            <ul className="list results">
              {results.length === 0 && (
                <li className="empty">{searching ? 'Searching…' : 'Nothing found. Try another spelling, or add the city name.'}</li>
              )}
              {results.map((r, i) => (
                <li key={i}>
                  <button className="item" onClick={() => flyTo(r.lng, r.lat, 12)}>
                    <span className="item-main">
                      <strong>{r.name}</strong>
                      <span className="muted small ellipsis">{r.label}</span>
                    </span>
                  </button>
                  <button
                    className="small-btn"
                    onClick={() => {
                      createPlace(r.lat, r.lng, r.name)
                      setResults(null)
                      setQuery('')
                      flyTo(r.lng, r.lat, 12)
                    }}
                  >
                    + Add
                  </button>
                </li>
              ))}
              <li>
                <button className="ghost small" onClick={() => { setResults(null); setQuery('') }}>Close results</button>
              </li>
            </ul>
          )}
          </>
        )}
        {!results && tab === 'places' && placesView === 'lines' && (
          <LinesView
            lines={lines}
            lookup={lookup}
            highlightId={lineHighlight}
            onAdd={() => startPick({ kind: 'line-start' })}
            onShow={showLine}
            onEdit={editLine}
          />
        )}
        {!results && !(tab === 'places' && placesView === 'lines') && (
          <CollectionView
            key={tab}
            kind={tab === 'places' ? 'place' : 'person'}
            items={tab === 'places' ? places : people}
            groups={groups}
            countryOf={countryOf}
            highlightId={highlight?.id ?? null}
            colorByGroup={tab === 'places' ? settings.colorPlacesByGroup : settings.colorPeopleByGroup}
            onShow={(id) => showOnMap({ kind: tab === 'places' ? 'place' : 'person', id })}
            onEdit={(id) => select({ kind: tab === 'places' ? 'place' : 'person', id })}
            onDelete={(item) => confirmDelete({ kind: tab === 'places' ? 'place' : 'person', id: item.id }, item.name)}
            onAdd={tab === 'places' ? () => startPick({ kind: 'new-place' }) : createPerson}
          />
        )}
      </>
    )

  return (
    <div className={'app' + (tab === 'timeline' || editedItem ? ' wide' : '')}>
      <MapView
        places={places}
        people={people}
        settings={mapSettings}
        selection={selection ?? highlight}
        picking={!!pick}
        mapRef={mapRef}
        onSelect={(sel) => select(sel)}
        onPick={handlePick}
        focus={focus}
        legs={legs}
        rates={rates}
        groups={groups}
        onAddFromMap={(name, lat, lng, category) => {
          setTab('places')
          createPlace(lat, lng, name, category)
        }}
        reach={trainsResult}
        reachHighlight={reachHighlight}
        onTrainsFrom={trainsFrom}
        travel={travel}
        lineHighlight={lineHighlight}
        onEditLine={editLine}
      />

      <MapToolbar settings={settings} groups={groups} ratesNote={ratesNote} />
      <button
        className={'simple-toggle' + (settings.simpleView ? ' active' : '')}
        onClick={() => updateSettings({ simpleView: !settings.simpleView })}
        title="Only pins, country names and travel lines"
      >
        {settings.simpleView ? '✨ Simple view: on' : '✨ Simple view'}
      </button>
      <SyncChip />

      {mapDay && !pick && (
        <div className="pick-banner day-banner">
          <span>Showing one day only</span>
          <button onClick={() => setMapDay(null)}>Show all</button>
        </div>
      )}

      {pick && (
        <div className="pick-banner">
          <span>
            {pick.kind === 'new-place' && 'Tap the map to drop a new place'}
            {pick.kind === 'move-place' && 'Tap the map to move the pin'}
            {pick.kind === 'person' && 'Tap the map where this person is'}
            {pick.kind === 'line-start' && 'Line: tap the start (pin, station, town or any point)'}
            {pick.kind === 'line-end' && `From ${pick.from.name}: now tap the destination`}
          </span>
          <button onClick={() => { setPick(null); setSheetOpen(true) }}>Cancel</button>
        </div>
      )}

      <aside ref={sheet.panelRef} className={'panel sheet-' + sheet.state}>
        <div className="sheet-header" {...sheet.headerProps}>
          <button
            className="sheet-handle"
            onClick={() => sheet.setState(sheet.state === 'peek' ? 'half' : 'peek')}
            aria-label="Drag or tap to resize the panel"
          >
            <span />
          </button>
          <nav className="tabs">
            {(['timeline', 'places', 'people', 'trains', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                className={tab === t && !selection && !editedItem && !editedLine ? 'active' : ''}
                onClick={() => {
                  setTab(t)
                  setSelection(null)
                  setEditingItem(null)
                  setEditingLine(null)
                  setSheetOpen(true)
                }}
                title={t === 'settings' ? 'Settings' : undefined}
              >
                {t === 'timeline'
                  ? 'Timeline'
                  : t === 'places'
                    ? `Places (${places.length})`
                    : t === 'people'
                      ? `People (${people.length})`
                      : t === 'trains'
                        ? '🚆 Trains'
                        : '⚙️'}
              </button>
            ))}
          </nav>
        </div>
        <div className="panel-body">{body}</div>
      </aside>
    </div>
  )
}
