import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapView, { type PickHit } from './components/MapView'
import LineEditor from './components/LineEditor'
import { avoidOf, currentRoute, drawnLines, legFocus, resolveEndpoint, routeKey, type RouteFocus } from './lines'
import { railRoute } from './rail/route'
import PlaceEditor from './components/PlaceEditor'
import PersonEditor from './components/PersonEditor'
import SettingsView from './components/SettingsView'
import TripView from './components/TripView'
import StopEditor from './components/StopEditor'
import CollectionView from './components/CollectionView'
import MapToolbar from './components/MapToolbar'
import { countryAt, useCountries } from './countries'
import { useRates } from './rates'
import { useBottomSheet } from './useBottomSheet'
import { SyncChip } from './components/SyncSection'
import TrainsView, { type TrainsContext } from './components/TrainsView'
import BudgetView from './components/BudgetView'
import { directTrainInfo, directTrains, findStation, type DirectTrainInfo, type Destination, type DirectQuery, type DirectResult, type Station } from './rail/transitous'
import { daysBetween, formatShort, today } from './dates'
import { toEur } from './budget'
import { COUNTRY_CURRENCY } from './data/currencies'
import {
  activityDate,
  appendStop,
  buildTrip,
  ordersAfter,
  placesInTrip,
  nearestStop,
  statusOf as tripStatus,
  stopEndpoint,
  stopForNight,
  tripLines,
  tripStops,
  type Lookup,
  type StopEntry,
} from './trip'
import { reverse, search, type GeoResult } from './geocode'
import {
  deletePerson,
  deletePlace,
  getPerson,
  getPlace,
  newId,
  nextActivityOrder,
  nextTripOrder,
  savePerson,
  saveActivity,
  savePlace,
  saveLine,
  saveStop,
  getLine,
  useActivities,
  useExpenses,
  useLines,
  useGroups,
  usePeople,
  usePlaces,
  useSettings,
  useStops,
} from './store'
import type { Endpoint, Person, Place, PlaceCategory, Selection, Settings, TravelLine } from './types'

type Tab = 'trip' | 'places' | 'trains' | 'budget' | 'settings'

const TAB_LABELS: Record<Tab, string> = {
  trip: 'Trip',
  places: 'Places',
  trains: 'Trains',
  budget: 'Budget',
  settings: '⚙️',
}

/** Next Wednesday: a normal weekday, so the timetable isn't a weekend one */
function nextWeekday() {
  const d = new Date()
  d.setDate(d.getDate() + (((3 - d.getDay() + 7) % 7) || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** How far ahead published timetables reliably reach; later travel days search a typical weekday */
const TIMETABLE_DAYS = 45

const isPhone = () => window.matchMedia('(max-width: 799px)').matches
type Pick =
  | { kind: 'new-place' }
  | { kind: 'move-place'; id: string }
  | { kind: 'person'; id: string }
  | { kind: 'line-start' }
  | { kind: 'line-end'; from: Endpoint; fromStation: boolean }
  | { kind: 'move-line-end'; lineId: string; end: 'from' | 'to' }
  | null

const NEW_PLACE_NAME = 'New place'

export default function App() {
  const places = usePlaces()
  const people = usePeople()
  const settings = useSettings()
  const stops = useStops()
  const activities = useActivities()
  const groups = useGroups()
  const lines = useLines()
  const expenses = useExpenses()
  const shapes = useCountries()
  // Needed for the currency overlay and for converting expenses
  const rates = useRates(true)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const [tab, setTab] = useState<Tab>('trip')
  // selection = item open in the editor; highlight = item marked on the map
  const [selection, setSelection] = useState<Selection>(null)
  const [highlight, setHighlight] = useState<Selection>(null)
  const [editingStop, setEditingStop] = useState<string | null>(null)
  /** Trip row marked in the list */
  const [tripHighlight, setTripHighlight] = useState<string | null>(null)
  /** Stop shown alone on the map (its map button) */
  const [focusStop, setFocusStop] = useState<string | null>(null)
  const [placesView, setPlacesView] = useState<'places' | 'people'>('places')
  const [editingLine, setEditingLine] = useState<string | null>(null)
  // A train or station of the open connection, highlighted on the map
  const [routeFocus, setRouteFocus] = useState<RouteFocus | null>(null)
  const [lineHighlight, setLineHighlight] = useState<string | null>(null)
  const [linePopup, setLinePopup] = useState<{ id: string; n: number } | null>(null)
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
  /** Per destination stop id: the direct train and whether Interrail covers it */
  /** The part of the trip the Trains tab was opened for */
  const [trainsContext, setTrainsContext] = useState<TrainsContext | null>(null)
  const [trainInfo, setTrainInfo] = useState<Record<string, DirectTrainInfo | null | 'loading' | 'error'>>({})
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
    () => ({
      places: new Map(places.map((p) => [p.id, p])),
      people: new Map(people.map((p) => [p.id, p])),
      avoid: settings.avoidCountries,
    }),
    [places, people, settings.avoidCountries],
  )

  const trip = useMemo(() => buildTrip(stops, lines, settings.tripStart), [stops, lines, settings.tripStart])
  const inTrip = useMemo(() => placesInTrip(trip, activities), [trip, activities])
  const statusOf = (p: Place) => tripStatus(p, inTrip)
  // The map colours pins by the status as shown
  const mapPlaces = useMemo(() => places.map((p) => ({ ...p, status: tripStatus(p, inTrip) })), [places, inTrip])
  const focusEntry = focusStop ? tripStops(trip).find((s) => s.id === focusStop) : undefined

  // Pins of the focused stop, numbered: the town, the bed, then the things to do by day
  const focus = useMemo(() => {
    if (!focusEntry) return null
    const nums = new Map<string, number>()
    const add = (key: string) => {
      if (!nums.has(key)) nums.set(key, nums.size + 1)
    }
    add('place:' + focusEntry.stop.placeId)
    const stay = focusEntry.stop.stay
    if (stay?.placeId) add('place:' + stay.placeId)
    if (stay?.personId) add('person:' + stay.personId)
    const key = (a: (typeof activities)[number]) => (activityDate(a, focusEntry) ?? '~') + (a.time || '~')
    const todo = activities.filter((a) => a.stopId === focusEntry.id && a.placeId).sort((a, b) => key(a).localeCompare(key(b)))
    for (const a of todo) add('place:' + a.placeId)
    return nums
  }, [focusEntry, activities])

  // The connections into and out of the focused stop
  const focusLines = useMemo(() => {
    if (!focusEntry) return null
    const i = trip.entries.indexOf(focusEntry)
    return new Set([trip.entries[i - 1], trip.entries[i + 1]].filter((e) => e?.kind === 'line').map((e) => e!.id))
  }, [focusEntry, trip])

  // Where you are: tonight's stop (or the one you just arrived at / leave today)
  const here = useMemo(() => {
    const t = today()
    return stopForNight(trip, t) ?? tripStops(trip).find((s) => s.arrive <= t && t <= s.depart) ?? null
  }, [trip])
  const hereCurrency = here ? COUNTRY_CURRENCY[countryOf.get(here.stop.placeId)?.iso ?? ''] ?? null : null
  const spentToday = useMemo(() => {
    const t = today()
    return expenses.filter((e) => e.date === t && !e.oneOff).reduce((sum, e) => sum + (toEur(e, rates) ?? 0), 0)
  }, [expenses, rates])

  const allTravel = useMemo(() => drawnLines(lines, lookup), [lines, lookup])
  const travel = useMemo(() => (focusLines ? allTravel.filter((l) => focusLines.has(l.id)) : allTravel), [allTravel, focusLines])

  // Train connections follow the tracks: look up each route once (and again if an end moves).
  // The result is stored with the line, so other devices and offline use get it for free.
  const routeAttempts = useRef(new Set<string>())
  const [routing, setRouting] = useState<Set<string>>(new Set())
  const [routeFailed, setRouteFailed] = useState<Set<string>>(new Set())
  useEffect(() => {
    for (const line of lines) {
      if (line.kind !== 'train' || currentRoute(line, lookup)) continue
      const key = routeKey(line, lookup)
      const attempt = `${line.id}|${key}`
      if (routeAttempts.current.has(attempt)) continue
      routeAttempts.current.add(attempt)
      setRouting((s) => new Set(s).add(line.id))
      railRoute(resolveEndpoint(line.from, lookup), resolveEndpoint(line.to, lookup), avoidOf(line, lookup))
        .then((r) => {
          const fresh = getLine(line.id)
          if (fresh) saveLine({ ...fresh, route: { key, path: r?.path ?? null, legs: r?.legs ?? [], countries: r?.countries ?? [] } })
        })
        .catch(() => {
          // Offline or the service is busy: try again next time the app opens
          setRouteFailed((s) => new Set(s).add(line.id))
        })
        .finally(() =>
          setRouting((s) => {
            const n = new Set(s)
            n.delete(line.id)
            return n
          }),
        )
    }
  }, [lines, lookup])

  // View trip: a clean map with only what its options allow
  const mapSettings: Settings = useMemo(() => {
    if (!settings.simpleView) return settings
    const v = settings.tripView
    // Ferries switched off in the Map menu come back too, so "Ferries" shows something
    const ferriesOff = !settings.showFerriesIncluded && !settings.showFerriesDiscount
    return {
      ...settings,
      interrailMode: v.interrail ? (settings.interrailMode === 'off' ? 'highlight' : settings.interrailMode) : 'off',
      showRailways: v.railways,
      showStreets: v.streets,
      showCurrencies: v.currencies,
      mapLabels: v.mapLabels,
      showPlaces: v.places,
      showPeople: v.people,
      showPlaceLabels: v.pinNames,
      showPeopleLabels: v.pinNames,
      showTravelLines: v.connections,
      showFerriesIncluded: v.ferries && (ferriesOff || settings.showFerriesIncluded),
      showFerriesDiscount: v.ferries && (ferriesOff || settings.showFerriesDiscount),
    }
  }, [settings])
  // Direct-train results only while the Trains tab is open (they're kept for when you come back)
  const trainsOpen = tab === 'trains' && !selection && !editingStop && !editingLine
  const hideReach = !trainsOpen || (settings.simpleView && !settings.tripView.directTrains)

  // Zoom to the focused stop
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    const bounds = new maplibregl.LngLatBounds()
    for (const key of focus.keys()) {
      const [kind, id] = key.split(':')
      const item = kind === 'place' ? lookup.places.get(id) : lookup.people.get(id)
      if (item?.lat != null && item.lng != null) bounds.extend([item.lng, item.lat])
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
    // Only when the chosen stop changes, not on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStop])

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
    setTrainInfo({})
    setTrainsOrigin(origin)
    setReachHighlight(null)
    setSelection(null)
    setEditingStop(null)
    setEditingLine(null)
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

  /** Look up which train runs to a destination (and its operator), once per destination */
  function checkDestination(d: Destination) {
    if (!trainsOrigin || (trainInfo[d.stopId] && trainInfo[d.stopId] !== 'error')) return
    setTrainInfo((t) => ({ ...t, [d.stopId]: 'loading' }))
    directTrainInfo(trainsOrigin, d, trainsQuery)
      .then((info) => setTrainInfo((t) => ({ ...t, [d.stopId]: info })))
      .catch(() => setTrainInfo((t) => ({ ...t, [d.stopId]: 'error' })))
  }

  function showDestination(d: Destination) {
    checkDestination(d)
    setReachHighlight(d.stopId)
    if (isPhone()) setSheetOpen(false)
    mapRef.current?.flyTo({ center: [d.lng, d.lat], zoom: Math.max(9, mapRef.current.getZoom()) })
  }

  function select(sel: Selection) {
    setSelection(sel)
    setHighlight(sel)
    setEditingStop(null)
    setEditingLine(null)
    setPick(null)
    if (!sel) return
    setTab('places')
    setPlacesView(sel.kind === 'place' ? 'places' : 'people')
    setSheetOpen(true)
  }

  /** Show an item on the map without opening its editor */
  function showOnMap(sel: NonNullable<Selection>) {
    setHighlight(sel)
    const item = sel.kind === 'place' ? getPlace(sel.id) : getPerson(sel.id)
    if (item?.lat == null || item.lng == null) return
    // On the phone, get the sheet out of the way so the pin is visible
    if (isPhone()) setSheetOpen(false)
    flyTo(item.lng, item.lat)
  }

  /** Trip row click: mark it and show the town on the map */
  function showStop(entry: StopEntry) {
    setTripHighlight(entry.id)
    showOnMap({ kind: 'place', id: entry.stop.placeId })
  }

  function editStop(id: string) {
    setSelection(null)
    setEditingLine(null)
    setEditingStop(id)
    setTripHighlight(id)
    setTab('trip')
    setSheetOpen(true)
  }

  /** Fit the map to a path, keeping it clear of the half-open list on the phone */
  function fitPath(path: [number, number][], maxZoom: number) {
    const map = mapRef.current
    if (!map || !path.length) return
    const padding = isPhone() ? { top: 70, left: 40, right: 40, bottom: window.innerHeight * 0.5 + 30 } : 80
    map.fitBounds(path.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(path[0], path[0])), { padding, maxZoom })
  }

  function addPlaceToStop(placeId: string, stopId: string) {
    const now = Date.now()
    saveActivity({
      id: newId(),
      stopId,
      day: null,
      placeId,
      title: '',
      time: '',
      order: nextActivityOrder(stopId),
      createdAt: now,
      updatedAt: now,
    })
    editStop(stopId)
  }

  /** Where the trip uses a place, for the chips in its editor */
  function placeUses(placeId: string) {
    const uses: { stopId: string; label: string }[] = []
    for (const s of tripStops(trip)) {
      const town = lookup.places.get(s.stop.placeId)?.name ?? ''
      if (s.stop.placeId === placeId) uses.push({ stopId: s.id, label: `🏙️ Stop · ${formatShort(s.arrive)}` })
      if (s.stop.stay?.placeId === placeId) uses.push({ stopId: s.id, label: `🛏️ Bed in ${town} · ${formatShort(s.arrive)}` })
      for (const a of activities)
        if (a.stopId === s.id && a.placeId === placeId) {
          const d = activityDate(a, s)
          uses.push({ stopId: s.id, label: `📍 In ${town}${d ? ' · ' + formatShort(d) : ''}` })
        }
    }
    return uses
  }

  /** Open the Trains tab for a part of the trip: its station, its date, and where it should go */
  function findTrainsFor(ctx: { afterId: string; lineId?: string; toStopId?: string }) {
    const entry = (id?: string) => trip.entries.find((e) => e.id === id)
    const lineEntry = entry(ctx.lineId)
    const after = entry(ctx.afterId)
    let from: Endpoint
    let target: Endpoint | null = null
    let date: string
    let isStation = false
    if (lineEntry?.kind === 'line') {
      from = resolveEndpoint(lineEntry.line.from, lookup)
      target = resolveEndpoint(lineEntry.line.to, lookup)
      date = lineEntry.date
      isStation = lineEntry.line.kind === 'train'
    } else if (after?.kind === 'stop') {
      from = stopEndpoint(after.stop, lookup)
      isStation = lookup.places.get(after.stop.placeId)?.category === 'station'
      date = after.depart
      const to = entry(ctx.toStopId)
      if (to?.kind === 'stop') target = stopEndpoint(to.stop, lookup)
    } else return
    const t = today()
    const typical = date < t || daysBetween(t, date) > TIMETABLE_DAYS
    setTrainsContext({
      afterId: ctx.afterId,
      lineId: lineEntry ? ctx.lineId : undefined,
      toStopId: target && !lineEntry ? ctx.toStopId : undefined,
      label: target ? `${from.name} → ${target.name}` : `Onwards from ${from.name}`,
      target: target && { name: target.name, lat: target.lat, lng: target.lng },
      travelDate: date,
      typical,
      avoid: lineEntry?.kind === 'line' ? avoidOf(lineEntry.line, lookup) : lookup.avoid,
    })
    setTrainsQuery((q) => ({ ...q, date: typical ? nextWeekday() : date }))
    void trainsFrom(from.name, from.lat, from.lng, isStation)
  }

  /** Trains for whatever follows a stop: its connection, the next stop, or anywhere */
  function trainsAfterStop(stopId: string) {
    const i = trip.entries.findIndex((e) => e.id === stopId)
    const next = trip.entries[i + 1]
    findTrainsFor({
      afterId: stopId,
      lineId: next?.kind === 'line' ? next.id : undefined,
      toStopId: next?.kind === 'stop' ? next.id : undefined,
    })
  }

  /** A direct-train result goes into the trip, as the Trains tab's context says */
  function addTrainToTrip(d: Destination) {
    if (!trainsOrigin) return
    const ctx = trainsContext
    const now = Date.now()
    const from: Endpoint = { name: trainsOrigin.name, lat: trainsOrigin.lat, lng: trainsOrigin.lng }
    const to: Endpoint = { name: d.name, lat: d.lat, lng: d.lng }
    // Arrives on a later day than it leaves: a night train
    const overnight = !!d.arrival && d.arrival.slice(0, 10) > trainsQuery.date
    const existing = ctx?.lineId ? getLine(ctx.lineId) : undefined
    let lineId: string
    if (existing) {
      lineId = existing.id
      saveLine({ ...existing, kind: 'train', from, to, overnight, route: null })
    } else {
      const [lineOrder, stopOrder] = ordersAfter(trip, ctx?.afterId ?? null, 2, nextTripOrder())
      lineId = newId()
      saveLine({ id: lineId, kind: 'train', from, to, notes: '', overnight, order: lineOrder, createdAt: now, updatedAt: now })
      // Not towards a stop of the trip: the destination becomes the next stop
      if (!ctx?.toStopId) {
        const place: Place = {
          id: newId(),
          name: d.name,
          lat: d.lat,
          lng: d.lng,
          category: 'station',
          status: 'idea',
          notes: '',
          url: '',
          createdAt: now,
          updatedAt: now,
        }
        savePlace(place)
        saveStop({ id: newId(), placeId: place.id, nights: 1, fixedDate: null, stay: null, notes: '', order: stopOrder, createdAt: now, updatedAt: now })
      }
    }
    setTrainsContext(null)
    editLine(lineId)
  }

  function confirmDelete(sel: NonNullable<Selection>, name: string) {
    const extra = sel.kind === 'place' && inTrip.has(sel.id) ? ' It is also removed from your trip.' : ''
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
    if (pick.kind === 'move-line-end') {
      setPick(null)
      setSheetOpen(true)
      const ep = await endpointFor(lat, lng, hit)
      const line = getLine(pick.lineId)
      if (line) saveLine({ ...line, [pick.end]: ep })
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
        order: nextTripOrder(),
        createdAt: now,
        updatedAt: now,
      }
      saveLine(line)
      editLine(line.id)
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

  const editedStop = editingStop ? tripStops(trip).find((s) => s.id === editingStop) : undefined
  const editedLine = editingLine ? lines.find((l) => l.id === editingLine) : undefined
  // Its trains, drawn one by one on the map while it's open
  const sections = (editedLine && currentRoute(editedLine, lookup)?.legs) || null

  function editLine(id: string) {
    setSelection(null)
    setEditingStop(null)
    setEditingLine(id)
    setRouteFocus(null)
    setLineHighlight(id)
    setTripHighlight(id)
    setTab('trip')
    setSheetOpen(true)
    // The whole connection in view, its trains drawn one by one
    const line = lines.find((l) => l.id === id)
    if (!line) return
    const a = resolveEndpoint(line.from, lookup)
    const b = resolveEndpoint(line.to, lookup)
    fitPath([[a.lng, a.lat], ...(currentRoute(line, lookup)?.path ?? []), [b.lng, b.lat]], 11)
  }

  /** Highlight a train or station of the open connection and bring it into view */
  function focusRoute(f: RouteFocus | null) {
    setRouteFocus(f)
    const map = mapRef.current
    if (!f || !map) return
    // On the phone the list stays open at half height, so keep the map part above it clear
    const phone = isPhone()
    if (phone && sheet.state === 'full') sheet.setState('half')
    if (f.path?.length) fitPath(f.path, 13)
    else if (f.points.length) map.easeTo({ center: f.points[0].at, zoom: Math.max(12, map.getZoom()), offset: [0, phone ? -window.innerHeight * 0.25 : 0] })
  }

  function showLine(line: TravelLine) {
    setLineHighlight(line.id)
    setTripHighlight(line.id)
    const a = resolveEndpoint(line.from, lookup)
    const b = resolveEndpoint(line.to, lookup)
    if (isPhone()) setSheetOpen(false)
    mapRef.current?.fitBounds(new maplibregl.LngLatBounds([a.lng, a.lat], [a.lng, a.lat]).extend([b.lng, b.lat]), {
      padding: 100,
      maxZoom: 11,
    })
    // Same popup as tapping the line on the map (trains, stops, Interrail coverage)
    setLinePopup((p) => ({ id: line.id, n: (p?.n ?? 0) + 1 }))
  }
  const selectedPlace = selection?.kind === 'place' ? places.find((p) => p.id === selection.id) : undefined
  const selectedPerson = selection?.kind === 'person' ? people.find((p) => p.id === selection.id) : undefined

  let body: React.ReactNode
  if (editedLine)
    body = (
      <LineEditor
        line={editedLine}
        trip={trip}
        entry={tripLines(trip).find((l) => l.id === editedLine.id)}
        lookup={lookup}
        routeFailed={routeFailed.has(editedLine.id) && !routing.has(editedLine.id)}
        onClose={() => {
          setEditingLine(null)
          setRouteFocus(null)
        }}
        routeFocus={routeFocus}
        onRouteFocus={focusRoute}
        onPickEnd={(end) => {
          setRouteFocus(null)
          startPick({ kind: 'move-line-end', lineId: editedLine.id, end })
        }}
        onFindTrains={() => {
          const i = trip.entries.findIndex((e) => e.id === editedLine.id)
          const prev = trip.entries[i - 1]
          if (prev) findTrainsFor({ afterId: prev.id, lineId: editedLine.id })
          else {
            // First thing of the trip: search from its start
            const from = resolveEndpoint(editedLine.from, lookup)
            setTrainsContext(null)
            void trainsFrom(from.name, from.lat, from.lng, editedLine.kind === 'train')
          }
        }}
      />
    )
  else if (editedStop)
    body = (
      <StopEditor
        trip={trip}
        entry={editedStop}
        activities={activities.filter((a) => a.stopId === editedStop.id)}
        lookup={lookup}
        onClose={() => setEditingStop(null)}
        onOpenPlace={(id) => select({ kind: 'place', id })}
        onShowPlace={(id) => showOnMap({ kind: 'place', id })}
        onTrains={() => trainsAfterStop(editedStop.id)}
      />
    )
  else if (selectedPlace) {
    const near = nearestStop(trip, lookup, selectedPlace)
    body = (
      <PlaceEditor
        place={selectedPlace}
        status={statusOf(selectedPlace)}
        uses={placeUses(selectedPlace.id)}
        nearest={near && near.stop.stop.placeId !== selectedPlace.id ? { id: near.stop.id, name: lookup.places.get(near.stop.stop.placeId)?.name ?? '' } : null}
        onClose={() => setSelection(null)}
        onMove={() => startPick({ kind: 'move-place', id: selectedPlace.id })}
        onTrains={() => trainsFrom(selectedPlace.name, selectedPlace.lat, selectedPlace.lng, selectedPlace.category === 'station')}
        onAddAsStop={() => editStop(appendStop(trip, lookup, selectedPlace))}
        onAddToStop={(stopId) => addPlaceToStop(selectedPlace.id, stopId)}
        onOpenStop={editStop}
      />
    )
  } else if (selectedPerson)
    body = (
      <PersonEditor
        person={selectedPerson}
        onClose={() => setSelection(null)}
        onPickOnMap={() => startPick({ kind: 'person', id: selectedPerson.id })}
        onLocated={(lat, lng) => flyTo(lng, lat, 10)}
      />
    )
  else if (tab === 'settings') body = <SettingsView settings={settings} />
  else if (tab === 'budget')
    body = (
      <BudgetView
        expenses={expenses}
        rates={rates}
        settings={settings}
        trip={trip}
        lookup={lookup}
        hereCurrency={hereCurrency}
      />
    )
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
        onOrigin={(s) => {
          setTrainsContext(null)
          if (s) showTrains(s)
          else setTrainsOrigin(null)
        }}
        onOriginFromPlace={(p) => {
          setTrainsContext(null)
          void trainsFrom(p.name, p.lat, p.lng, p.category === 'station')
        }}
        onQuery={(q) => {
          setTrainInfo({})
          setTrainsQuery(q)
        }}
        trainInfo={trainInfo}
        settings={settings}
        onShow={showDestination}
        onAddPlace={(d) => createPlace(d.lat, d.lng, d.name, 'station')}
        onAddToTrip={addTrainToTrip}
        context={trainsContext}
        onClearContext={() => setTrainsContext(null)}
      />
    )
  else if (tab === 'trip')
    body = (
      <TripView
        trip={trip}
        activities={activities}
        lookup={lookup}
        settings={settings}
        spentToday={spentToday}
        focusStop={focusStop}
        highlightId={tripHighlight}
        onFocusStop={setFocusStop}
        onEditStop={editStop}
        onEditLine={editLine}
        onShowStop={showStop}
        onShowLine={showLine}
        onFindTrains={findTrainsFor}
        onDrawLine={() => startPick({ kind: 'line-start' })}
        onOpenBudget={() => setTab('budget')}
      />
    )
  else
    body = (
      <>
        <div className="segmented view-switch">
          <button className={placesView === 'places' ? 'active' : ''} onClick={() => setPlacesView('places')}>
            📍 Places ({places.length})
          </button>
          <button className={placesView === 'people' ? 'active' : ''} onClick={() => setPlacesView('people')}>
            👤 People ({people.length})
          </button>
        </div>
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
        {!results && (
          <CollectionView
            key={placesView}
            kind={placesView === 'places' ? 'place' : 'person'}
            items={placesView === 'places' ? places : people}
            groups={groups}
            countryOf={countryOf}
            highlightId={highlight?.id ?? null}
            colorByGroup={placesView === 'places' ? settings.colorPlacesByGroup : settings.colorPeopleByGroup}
            statusOf={statusOf}
            onShow={(id) => showOnMap({ kind: placesView === 'places' ? 'place' : 'person', id })}
            onEdit={(id) => select({ kind: placesView === 'places' ? 'place' : 'person', id })}
            onDelete={(item) => confirmDelete({ kind: placesView === 'places' ? 'place' : 'person', id: item.id }, item.name)}
            onAdd={placesView === 'places' ? () => startPick({ kind: 'new-place' }) : createPerson}
          />
        )}
      </>
    )

  return (
    <div className="app">
      <MapView
        places={mapPlaces}
        people={people}
        settings={mapSettings}
        selection={selection ?? highlight}
        picking={!!pick}
        mapRef={mapRef}
        onSelect={(sel) => select(sel)}
        onPick={handlePick}
        focus={focus}
        rates={rates}
        groups={groups}
        onAddFromMap={(name, lat, lng, category) => {
          setTab('places')
          createPlace(lat, lng, name, category)
        }}
        reach={hideReach ? null : trainsResult}
        reachHighlight={reachHighlight}
        onTrainsFrom={(name, lat, lng, isStation) => {
          setTrainsContext(null)
          void trainsFrom(name, lat, lng, isStation)
        }}
        onReachSelect={(stopId) => {
          const d = trainsResult?.destinations.find((x) => x.stopId === stopId)
          if (!d) return
          checkDestination(d)
          setReachHighlight(stopId)
          setTab('trains')
        }}
        travel={travel}
        lineHighlight={lineHighlight}
        routeFocus={editedLine ? routeFocus : null}
        sections={sections}
        onSectionClick={(i) => {
          const leg = sections?.[i]
          if (leg) focusRoute(routeFocus?.key === `leg:${i}` ? null : legFocus(leg, i))
        }}
        linePopup={linePopup}
        onEditLine={editLine}
      />

      <MapToolbar settings={settings} groups={groups} ratesNote={ratesNote} />
      <SyncChip />

      {focusEntry && !pick && (
        <div className="pick-banner day-banner">
          <span>Showing {lookup.places.get(focusEntry.stop.placeId)?.name || 'one stop'} only</span>
          <button onClick={() => setFocusStop(null)}>Show all</button>
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
            {pick.kind === 'move-line-end' && `Tap the new ${pick.end === 'from' ? 'start' : 'end'} (pin, station, town or any point)`}
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
            {(['trip', 'places', 'trains', 'budget', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                className={tab === t && !selection && !editedStop && !editedLine ? 'active' : ''}
                onClick={() => {
                  setTab(t)
                  setSelection(null)
                  setEditingStop(null)
                  setEditingLine(null)
                  setSheetOpen(true)
                }}
                title={t === 'settings' ? 'Settings' : undefined}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </div>
        <div className="panel-body">{body}</div>
      </aside>
    </div>
  )
}
