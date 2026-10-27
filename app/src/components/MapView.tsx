import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CATEGORIES, STATUSES } from '../data/categories'
import { COUNTRIES_URL } from '../countries'
import { COUNTRY_LABELS } from '../data/countryLabels'
import { COUNTRY_CURRENCY, CURRENCY_STYLE, NO_CURRENCY_LABEL } from '../data/currencies'
import { formatRate, type Rates } from '../rates'
import { NO_GROUP, type Group, type Person, type Place, type PlaceCategory, type Selection, type Settings } from '../types'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const VIEW_KEY = 'rail-planner:view'

interface Props {
  places: Place[]
  people: Person[]
  settings: Settings
  selection: Selection
  picking: boolean
  mapRef: React.RefObject<maplibregl.Map | null>
  onSelect: (sel: Selection) => void
  onPick: (lat: number, lng: number) => void
  /** When set, only these markers are shown, each with its stop number */
  focus: Map<string, number> | null
  /** Train legs drawn as lines */
  legs: [number, number][][]
  rates: Rates | null
  groups: Group[]
  /** A city / POI label of the basemap was tapped and the user wants it in their places */
  onAddFromMap: (name: string, lat: number, lng: number, category: PlaceCategory) => void
}

// Basemap labels that can be tapped to add them as a place
const CLICKABLE_LAYERS = [
  'label_city_capital',
  'label_city',
  'label_town',
  'label_village',
  'label_other',
  'poi_transit',
  'poi_r1',
  'poi_r7',
  'poi_r20',
]

function categoryFor(f: maplibregl.MapGeoJSONFeature): PlaceCategory {
  const cls = String(f.properties.class ?? '')
  if (f.sourceLayer === 'place') return 'city'
  if (cls === 'railway' || cls === 'rail' || f.layer.id === 'poi_transit') return 'station'
  if (['restaurant', 'cafe', 'fast_food', 'ice_cream', 'bakery'].includes(cls)) return 'food'
  if (['bar', 'beer', 'pub', 'nightclub'].includes(cls)) return 'nightlife'
  if (['lodging', 'hotel', 'hostel', 'campsite'].includes(cls)) return 'stay'
  if (['park', 'garden', 'beach', 'nature_reserve'].includes(cls)) return 'nature'
  if (['shop', 'grocery', 'clothing_store'].includes(cls)) return 'shop'
  return 'sight'
}

/** Basemap text: all, only country names, or none */
function applyLabels(map: maplibregl.Map, mode: Settings['mapLabels']) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol' || OWN_SYMBOL_LAYERS.has(layer.id)) continue
    const show = mode === 'all' || (mode === 'countries' && layer.id.startsWith('label_country'))
    map.setLayoutProperty(layer.id, 'visibility', show ? 'visible' : 'none')
  }
}

/** Darker shade of a #rrggbb colour, for readable text */
function darken(hex: string, amount = 0.45) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount))
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

/** One label point per non-euro country: "Kč · CZK" / "1 € = 24.4 Kč" */
function currencyPoints(rates: Rates | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const [iso, pos] of Object.entries(COUNTRY_LABELS)) {
    const code = COUNTRY_CURRENCY[iso]
    if (!code || code === 'EUR' || NO_CURRENCY_LABEL.has(iso)) continue
    const style = CURRENCY_STYLE[code]
    const symbol = style?.symbol ?? code
    const rate = rates?.rates[code]
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: pos },
      properties: {
        title: `${symbol} · ${code}`,
        rate: rate ? `1 € = ${formatRate(rate)} ${symbol}` : '',
        color: darken(style?.color ?? '#64748b'),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

// Our own text layers: never hidden by the "map text" setting
const OWN_SYMBOL_LAYERS = new Set(['cur-labels'])

// One colour per currency zone
const CURRENCY_FILL = [
  'match',
  ['get', 'iso'],
  ...Object.entries(COUNTRY_CURRENCY).flatMap(([iso, code]) => [iso, CURRENCY_STYLE[code]?.color ?? '#94a3b8']),
  'rgba(0,0,0,0)',
] as unknown as maplibregl.ExpressionSpecification

const legsGeoJson = (legs: [number, number][][]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: legs.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
})

function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '')
    if (Array.isArray(v.center) && typeof v.zoom === 'number') return v
  } catch {
    /* no saved view */
  }
  return { center: [14, 50], zoom: 3.6 }
}

function saveView(map: maplibregl.Map) {
  try {
    const c = map.getCenter()
    localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() }))
  } catch {
    /* storage unavailable */
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

function applyInterrail(map: maplibregl.Map, settings: Settings) {
  if (!map.getLayer('ir-fill')) return
  const inIr: maplibregl.ExpressionSpecification = [
    'in',
    ['get', 'iso'],
    ['literal', settings.interrailCountries],
  ]
  const mode = settings.interrailMode
  const visible = mode === 'off' ? 'none' : 'visible'
  map.setLayoutProperty('ir-line', 'visibility', visible)
  // The currency zones take over the fill; the Interrail outline stays
  map.setLayoutProperty('ir-fill', 'visibility', settings.showCurrencies ? 'none' : visible)
  map.setPaintProperty(
    'ir-fill',
    'fill-color',
    mode === 'highlight'
      ? ['case', inIr, 'rgba(13,148,136,0.28)', 'rgba(100,116,139,0.10)']
      : ['case', inIr, 'rgba(0,0,0,0)', 'rgba(51,65,85,0.55)'],
  )
  map.setFilter('ir-line', inIr)
}

export default function MapView({
  places,
  people,
  settings,
  selection,
  picking,
  mapRef,
  onSelect,
  onPick,
  focus,
  legs,
  rates,
  groups,
  onAddFromMap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markers = useRef(new Map<string, maplibregl.Marker>())
  const currencyData = useMemo(() => currencyPoints(rates), [rates])
  const currencyRef = useRef(currencyData)
  currencyRef.current = currencyData
  // Latest values for map event handlers registered once
  const latest = useRef({ picking, onPick, onSelect, settings, onAddFromMap })
  latest.current = { picking, onPick, onSelect, settings, onAddFromMap }
  const legsRef = useRef(legs)
  legsRef.current = legs

  useEffect(() => {
    const view = loadView()
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URL,
      center: view.center,
      zoom: view.zoom,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    // The compass needle always points north; tapping it turns the map back to north
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      'top-right',
    )
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      map.addSource('countries', { type: 'geojson', data: COUNTRIES_URL })
      // Put the overlay under the basemap labels so city names stay readable
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
      map.addLayer(
        {
          id: 'ir-fill',
          type: 'fill',
          source: 'countries',
          // Strong at country level, fading out when zoomed into a city
          paint: { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 1, 10, 0.35] },
        },
        firstSymbol,
      )
      map.addLayer(
        {
          id: 'ir-line',
          type: 'line',
          source: 'countries',
          paint: {
            'line-color': '#0d9488',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 8, 3],
            // The outline is approximate; let the basemap's exact borders take over when zoomed in
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.9, 9, 0],
          },
        },
        firstSymbol,
      )
      applyInterrail(map, latest.current.settings)

      // Currency overlay: every currency gets its own coloured zone
      map.addLayer(
        {
          id: 'cur-fill',
          type: 'fill',
          source: 'countries',
          layout: { visibility: latest.current.settings.showCurrencies ? 'visible' : 'none' },
          paint: {
            'fill-color': CURRENCY_FILL,
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.38, 10, 0.1],
          },
        },
        firstSymbol,
      )
      // Placed below the city / country names: those win when space is tight, and the
      // currency label moves to a free spot around its point (or waits for more zoom)
      map.addSource('cur-points', { type: 'geojson', data: currencyRef.current })
      map.addLayer(
        {
          id: 'cur-labels',
          type: 'symbol',
          source: 'cur-points',
          layout: {
            visibility: latest.current.settings.showCurrencies ? 'visible' : 'none',
            'text-field': [
              'format',
              ['get', 'title'],
              { 'text-font': ['literal', ['Noto Sans Bold']] },
              '\n',
              {},
              ['get', 'rate'],
              { 'font-scale': 0.88 },
            ],
            'text-font': ['Noto Sans Regular'],
            'text-size': 12.5,
            'text-variable-anchor': ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
            'text-radial-offset': 1.1,
            'text-justify': 'auto',
            'text-padding': 4,
          },
          paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': 'rgba(255, 255, 255, 0.85)',
            'text-halo-width': 1.6,
            'text-halo-blur': 0.5,
          },
        },
        'label_other',
      )
      applyLabels(map, latest.current.settings.mapLabels)

      map.addSource('legs', { type: 'geojson', data: legsGeoJson(legsRef.current) })
      map.addLayer({
        id: 'legs-casing',
        type: 'line',
        source: 'legs',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8 },
      })
      map.addLayer({
        id: 'legs',
        type: 'line',
        source: 'legs',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#9a3412', 'line-width': 3, 'line-dasharray': [2, 1.5] },
      })
    })

    map.on('click', (e) => {
      const { picking, onPick, onSelect } = latest.current
      // Marker clicks stop propagation, so this is always a click on the map itself
      if (picking) {
        onPick(e.lngLat.lat, e.lngLat.lng)
        return
      }
      onSelect(null)
      const { x, y } = e.point
      const layers = CLICKABLE_LAYERS.filter((id) => map.getLayer(id))
      const hit = map.queryRenderedFeatures(
        [
          [x - 8, y - 8],
          [x + 8, y + 8],
        ],
        { layers },
      )[0]
      if (hit) showAddPopup(hit, e.lngLat)
    })

    /** Popup on a tapped city / POI label with a button to add it to the places */
    function showAddPopup(f: maplibregl.MapGeoJSONFeature, clicked: maplibregl.LngLat) {
      const p = f.properties
      const name = String(p['name:en'] || p.name_en || p['name:latin'] || p.name || '')
      if (!name) return
      const [lng, lat] =
        f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : [clicked.lng, clicked.lat]
      const el = document.createElement('div')
      el.className = 'add-popup'
      const title = document.createElement('strong')
      title.textContent = name
      const kind = document.createElement('span')
      kind.className = 'muted small'
      kind.textContent = String(p.subclass || p.class || '').replace(/_/g, ' ')
      const btn = document.createElement('button')
      btn.className = 'primary'
      btn.textContent = '+ Add to places'
      el.append(title, kind, btn)
      const popup = new maplibregl.Popup({ className: 'map-popup', offset: 10, maxWidth: '240px' })
        .setLngLat([lng, lat])
        .setDOMContent(el)
        .addTo(map)
      btn.addEventListener('click', () => {
        latest.current.onAddFromMap(name, lat, lng, categoryFor(f))
        popup.remove()
      })
    }
    map.on('moveend', () => saveView(map))

    return () => {
      map.remove()
      mapRef.current = null
      markers.current.clear()
    }
  }, [mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('ir-fill')) return
    applyInterrail(map, settings)
    applyLabels(map, settings.mapLabels)
  }, [settings, mapRef])

  useEffect(() => {
    const source = mapRef.current?.getSource('legs') as maplibregl.GeoJSONSource | undefined
    source?.setData(legsGeoJson(legs))
  }, [legs, mapRef])

  useEffect(() => {
    mapRef.current?.getCanvas().classList.toggle('picking', picking)
  }, [picking, mapRef])

  // Sync HTML markers with places + people
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const wanted = new Map<
      string,
      { lng: number; lat: number; title: string; render: (el: HTMLElement) => void; sel: Selection; anchor: 'bottom' | 'center' }
    >()

    // A focused day overrides the layer toggles: show exactly that day's stops
    const showPlaces = focus ? true : settings.showPlaces
    const showPeople = focus ? true : settings.showPeople
    const hidden = new Set(settings.hiddenGroups)
    const groupColor = new Map(groups.map((g) => [g.id, g.color]))
    const include = (key: string, kind: 'place' | 'person', groupId?: string | null) =>
      focus ? focus.has(key) : !hidden.has(groupId ?? `${NO_GROUP}:${kind}`)

    if (showPlaces)
      for (const p of places)
        if (include('place:' + p.id, 'place', p.groupId))
          wanted.set('place:' + p.id, {
            lng: p.lng,
            lat: p.lat,
            sel: { kind: 'place', id: p.id },
            anchor: 'bottom',
            title: p.name || 'Unnamed',
            render: (el) => {
              el.className = 'marker place-marker'
              const group = settings.colorPlacesByGroup && p.groupId ? groupColor.get(p.groupId) : undefined
              el.style.setProperty('--pin', group ?? STATUSES[p.status].color)
              el.innerHTML = `<span>${CATEGORIES[p.category].icon}</span>`
            },
          })

    if (showPeople)
      for (const p of people)
        if (p.lat != null && p.lng != null && include('person:' + p.id, 'person', p.groupId))
          wanted.set('person:' + p.id, {
            lng: p.lng,
            lat: p.lat,
            sel: { kind: 'person', id: p.id },
            anchor: 'center',
            title: p.name || 'Unnamed',
            render: (el) => {
              el.className = 'marker person-marker' + (p.precision === 'city' ? ' approx' : '') + (p.canStay ? ' stay' : '')
              const group = settings.colorPeopleByGroup && p.groupId ? groupColor.get(p.groupId) : undefined
              el.style.background = group ?? ''
              el.textContent = initials(p.name)
            },
          })

    for (const [key, marker] of markers.current)
      if (!wanted.has(key)) {
        marker.remove()
        markers.current.delete(key)
      }

    for (const [key, w] of wanted) {
      let marker = markers.current.get(key)
      if (!marker) {
        // MapLibre owns the outer element (its classes + transform position it on the map),
        // so all styling goes on an inner element
        const el = document.createElement('button')
        el.className = 'marker-btn kind-' + key.split(':')[0]
        const label = document.createElement('span')
        label.className = 'marker-label'
        const badge = document.createElement('span')
        badge.className = 'marker-num'
        el.append(document.createElement('span'), badge, label)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          latest.current.onSelect(w.sel)
        })
        marker = new maplibregl.Marker({ element: el, anchor: w.anchor, offset: w.anchor === 'bottom' ? [0, -12] : [0, 0] })
          .setLngLat([w.lng, w.lat])
          .addTo(map)
        markers.current.set(key, marker)
      } else {
        marker.setLngLat([w.lng, w.lat])
      }
      const outer = marker.getElement()
      const inner = outer.firstElementChild as HTMLElement
      w.render(inner)
      const selected = !!selection && key === `${selection.kind}:${selection.id}`
      inner.classList.toggle('selected', selected)
      outer.title = w.title
      outer.classList.toggle('is-selected', selected)
      // Above the currency labels; the selected one above everything
      outer.style.zIndex = selected ? '3' : '1'
      ;(outer.lastElementChild as HTMLElement).textContent = w.title
      ;(outer.children[1] as HTMLElement).textContent = focus?.has(key) ? String(focus.get(key)) : ''
    }
  }, [
    places,
    people,
    groups,
    settings.showPlaces,
    settings.showPeople,
    settings.hiddenGroups,
    settings.colorPlacesByGroup,
    settings.colorPeopleByGroup,
    selection,
    focus,
    mapRef,
  ])

  // Currency overlay: zones + labels (labels are a map layer, so they dodge other text)
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('cur-fill')) return
    const visibility = settings.showCurrencies ? 'visible' : 'none'
    map.setLayoutProperty('cur-fill', 'visibility', visibility)
    map.setLayoutProperty('cur-labels', 'visibility', visibility)
    ;(map.getSource('cur-points') as maplibregl.GeoJSONSource).setData(currencyData)
  }, [settings.showCurrencies, currencyData, mapRef])

  const classes = ['map']
  if (settings.showPlaceLabels) classes.push('labels-place')
  if (settings.showPeopleLabels) classes.push('labels-person')
  return <div ref={containerRef} className={classes.join(' ')} />
}
