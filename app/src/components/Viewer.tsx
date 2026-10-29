import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapView from './MapView'
import TripView from './TripView'
import { LineDetails, StopDetails } from './TripDetails'
import { currentRoute, drawnLines, legFocus, resolveEndpoint, type RouteFocus } from '../lines'
import { buildTrip, placesInTrip, statusOf, tripLines, tripStops, type Lookup } from '../trip'
import { fitPath, isPhone } from '../mapFit'
import { useBottomSheet } from '../useBottomSheet'
import { refreshShared, showShared, type LoadedShare } from '../share'
import { mapSettingsFor, useActivities, useGroups, useLines, usePeople, usePlaces, useSettings, useStops } from '../store'
import type { Selection } from '../types'

// Someone's shared trip: the map (as with "View trip" on) and the trip list, read-only. Tap a
// stop or a connection for its details. A newer snapshot behind the link shows up by itself.

const REFRESH = 5 * 60 * 1000

const when = (t: number) =>
  new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Viewer({ initial }: { initial: LoadedShare }) {
  const places = usePlaces()
  const people = usePeople()
  const settings = useSettings()
  const stops = useStops()
  const activities = useActivities()
  const groups = useGroups()
  const lines = useLines()
  const mapRef = useRef<maplibregl.Map | null>(null)
  const sheet = useBottomSheet()
  const [sharedAt, setSharedAt] = useState(initial.trip.sharedAt)
  const [offline, setOffline] = useState(initial.offline)
  const [openStop, setOpenStop] = useState<string | null>(null)
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [routeFocus, setRouteFocus] = useState<RouteFocus | null>(null)
  const [highlight, setHighlight] = useState<Selection>(null)
  const [rowHighlight, setRowHighlight] = useState<string | null>(null)


  // The snapshot may be updated: pick up the latest now and then, and when coming back to the page
  useEffect(() => {
    let since = sharedAt
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const fresh = await refreshShared(since)
      if (!fresh) return
      since = fresh.sharedAt
      showShared(fresh)
      setSharedAt(fresh.sharedAt)
      setOffline(false)
    }
    const timer = setInterval(check, REFRESH)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
    // Set up once; `since` keeps track from here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const mapPlaces = useMemo(() => places.map((p) => ({ ...p, status: statusOf(p, inTrip) })), [places, inTrip])
  const travel = useMemo(() => drawnLines(lines, lookup), [lines, lookup])
  const mapSettings = useMemo(() => mapSettingsFor(settings), [settings])

  // Start with the list half open and the whole trip in view
  const setSheetOpen = sheet.setOpen
  useEffect(() => {
    document.title = 'Shared trip · Rail Planner'
    setSheetOpen(true)
    const at: [number, number][] = drawnLines(lines, lookup).flatMap((l) => l.coords)
    for (const s of stops) {
      const p = lookup.places.get(s.placeId)
      if (p) at.push([p.lng, p.lat])
    }
    fitPath(mapRef.current, at, 10)
    // Once, on opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopEntry = openStop ? tripStops(trip).find((s) => s.id === openStop) : undefined
  const line = openLine ? lines.find((l) => l.id === openLine) : undefined
  const sections = (line && currentRoute(line, lookup)?.legs) || null

  function flyTo(lng: number, lat: number, zoom: number) {
    const map = mapRef.current
    if (!map) return
    map.flyTo({ center: [lng, lat], zoom: Math.max(zoom, map.getZoom()), offset: [0, isPhone() ? -window.innerHeight * 0.25 : 0] })
  }

  function showStop(id: string) {
    const entry = tripStops(trip).find((s) => s.id === id)
    if (!entry) return
    setOpenLine(null)
    setRouteFocus(null)
    setOpenStop(id)
    setRowHighlight(id)
    setHighlight({ kind: 'place', id: entry.stop.placeId })
    sheet.setOpen(true)
    const p = lookup.places.get(entry.stop.placeId)
    if (p) flyTo(p.lng, p.lat, 11)
  }

  function showLine(id: string) {
    const l = lines.find((x) => x.id === id)
    if (!l) return
    setOpenStop(null)
    setOpenLine(id)
    setRouteFocus(null)
    setRowHighlight(id)
    sheet.setOpen(true)
    const a = resolveEndpoint(l.from, lookup)
    const b = resolveEndpoint(l.to, lookup)
    fitPath(mapRef.current, [[a.lng, a.lat], ...(currentRoute(l, lookup)?.path ?? []), [b.lng, b.lat]], 11)
  }

  function showPlace(id: string) {
    setHighlight({ kind: 'place', id })
    const p = lookup.places.get(id)
    if (p) flyTo(p.lng, p.lat, 14)
  }

  function focusRoute(f: RouteFocus | null) {
    setRouteFocus(f)
    const map = mapRef.current
    if (!f || !map) return
    if (isPhone() && sheet.state === 'full') sheet.setState('half')
    if (f.path?.length) fitPath(map, f.path, 13)
    else if (f.points.length) flyTo(f.points[0].at[0], f.points[0].at[1], 12)
  }

  /** A pin was tapped: open the stop it belongs to (its town, bed or one of its things to do) */
  function selectPin(sel: Selection) {
    setHighlight(sel)
    if (!sel) return
    const s = tripStops(trip).find((e) =>
      sel.kind === 'place'
        ? e.stop.placeId === sel.id || e.stop.stay?.placeId === sel.id || activities.some((a) => a.stopId === e.id && a.placeId === sel.id)
        : e.stop.stay?.personId === sel.id,
    )
    if (s) showStop(s.id)
  }

  const close = () => {
    setOpenStop(null)
    setOpenLine(null)
    setRouteFocus(null)
  }

  let body: React.ReactNode
  if (line)
    body = (
      <LineDetails
        line={line}
        entry={tripLines(trip).find((l) => l.id === line.id)}
        lookup={lookup}
        onClose={close}
        routeFocus={routeFocus}
        onRouteFocus={focusRoute}
      />
    )
  else if (stopEntry)
    body = (
      <StopDetails
        entry={stopEntry}
        activities={activities.filter((a) => a.stopId === stopEntry.id)}
        lookup={lookup}
        onClose={close}
        onShowPlace={showPlace}
      />
    )
  else
    body = (
      <TripView
        trip={trip}
        activities={activities}
        lookup={lookup}
        settings={settings}
        spentToday={0}
        focusStop={null}
        highlightId={rowHighlight}
        onFocusStop={() => {}}
        onEditStop={showStop}
        onEditLine={showLine}
        onShowStop={(e) => showStop(e.id)}
        onShowLine={(l) => showLine(l.id)}
        onFindTrains={() => {}}
        onDrawLine={() => {}}
        onOpenBudget={() => {}}
        readOnly
      />
    )

  return (
    <div className="app">
      <MapView
        places={mapPlaces}
        people={people}
        settings={mapSettings}
        selection={highlight}
        picking={false}
        mapRef={mapRef}
        onSelect={selectPin}
        onPick={() => {}}
        focus={null}
        rates={null}
        groups={groups}
        onAddFromMap={() => {}}
        reach={null}
        reachHighlight={null}
        onTrainsFrom={() => {}}
        onReachSelect={() => {}}
        travel={travel}
        lineHighlight={openLine}
        routeFocus={line ? routeFocus : null}
        sections={sections}
        onSectionClick={(i) => {
          const leg = sections?.[i]
          if (leg) focusRoute(routeFocus?.key === `leg:${i}` ? null : legFocus(leg, i))
        }}
        linePopup={null}
        onEditLine={showLine}
        readOnly
      />

      <aside ref={sheet.panelRef} className={'panel sheet-' + sheet.state}>
        <div className="sheet-header" {...sheet.headerProps}>
          <button
            className="sheet-handle"
            onClick={() => sheet.setState(sheet.state === 'peek' ? 'half' : 'peek')}
            aria-label="Drag or tap to resize the panel"
          >
            <span />
          </button>
          <div className="share-head">
            <strong>🔗 Shared trip</strong>
            <span className="muted small">
              Read-only · as of {when(sharedAt)}
              {offline ? ' · offline copy' : ''}
            </span>
          </div>
        </div>
        <div className="panel-body">
          {body}
          {!line && !stopEntry && (
            <p className="muted small share-foot">
              Shared with Rail Planner.{' '}
              <a href={import.meta.env.BASE_URL}>Open your own trip</a> ·{' '}
              <a href={import.meta.env.BASE_URL + 'impressum.html'} target="_blank" rel="noreferrer">
                Impressum
              </a>
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

/** The link couldn't be opened */
export function ShareError({ message }: { message: string }) {
  return (
    <div className="share-error">
      <h2>🔗 Shared trip</h2>
      <p>{message}</p>
      <a className="button" href={import.meta.env.BASE_URL}>
        Open Rail Planner
      </a>
    </div>
  )
}
