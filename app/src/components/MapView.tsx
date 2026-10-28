import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CATEGORIES, STATUSES } from '../data/categories'
import { COUNTRIES_URL } from '../countries'
import { COUNTRY_LABELS } from '../data/countryLabels'
import { COUNTRY_CURRENCY, CURRENCY_STYLE, NO_CURRENCY_LABEL } from '../data/currencies'
import { formatRate, type Rates } from '../rates'
import { findStation, formatMinutes, type DirectResult } from '../rail/transitous'
import { RAIL_TYPE, RAIL_TYPES } from '../data/railTypes'
import { legSummary, LINE_KINDS, timeOf, type DrawnLine } from '../lines'
import { coverage, COVERAGE_LABEL } from '../data/interrailOperators'
import { FERRIES, FERRY_INFO_URL, FERRY_STYLE } from '../data/ferries'
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
  /** A map tap while picking; `hit` says what was tapped (a pin, a station, a town) */
  onPick: (lat: number, lng: number, hit?: PickHit) => void
  /** When set, only these markers are shown, each with its number */
  focus: Map<string, number> | null
  rates: Rates | null
  groups: Group[]
  /** A city / POI label of the basemap was tapped and the user wants it in their places */
  onAddFromMap: (name: string, lat: number, lng: number, category: PlaceCategory) => void
  /** Direct-train lookup shown on the map */
  reach: DirectResult | null
  reachHighlight: string | null
  /** Show direct trains from a station (exact spot) or a city (find its main station) */
  onTrainsFrom: (name: string, lat: number, lng: number, isStation: boolean) => void
  /** A direct-train dot was tapped */
  onReachSelect: (stopId: string) => void
  travel: DrawnLine[]
  lineHighlight: string | null
  /** Open a line's popup (e.g. when it was tapped in the list); `n` changes on every request */
  linePopup: { id: string; n: number } | null
  onEditLine: (id: string) => void
}

export interface PickHit {
  placeId?: string
  personId?: string
  name?: string
  /** A railway station was tapped */
  station?: boolean
}

const travelGeoJson = (lines: DrawnLine[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: lines.flatMap((l): GeoJSON.Feature[] => [
    { type: 'Feature', properties: { id: l.id, kind: l.kind, title: l.title }, geometry: { type: 'LineString', coordinates: l.coords } },
    // End dots, so lines to a free point don't just stop in the void
    ...[l.coords[0], l.coords[l.coords.length - 1]].map((c): GeoJSON.Feature => ({ type: 'Feature', properties: { kind: l.kind }, geometry: { type: 'Point', coordinates: c } })),
  ]),
})

const ferriesGeoJson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: FERRIES.map((f, i) => ({
    type: 'Feature',
    properties: { i, included: f.included },
    geometry: { type: 'LineString', coordinates: f.path.map(([lat, lng]) => [lng, lat]) },
  })),
}

const IS_LINE: maplibregl.ExpressionSpecification = ['==', ['geometry-type'], 'LineString']

const reachGeoJson = (reach: DirectResult | null): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: (reach?.destinations ?? []).map((d) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
    properties: {
      stopId: d.stopId,
      name: d.name,
      minutes: d.minutes,
      importance: d.importance,
      label: `${d.name}\n${formatMinutes(d.minutes)}`,
    },
  })),
})

const originGeoJson = (reach: DirectResult | null): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: reach
    ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [reach.origin.lng, reach.origin.lat] }, properties: { name: reach.origin.name } }]
    : [],
})

// Travel time colours: green (close) → yellow → red → dark red (far)
const REACH_COLOR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'minutes'],
  0, '#15803d',
  90, '#65a30d',
  180, '#ca8a04',
  300, '#ea580c',
  480, '#dc2626',
  720, '#7f1d1d',
]

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
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer']
    if (sourceLayer === 'transportation' || sourceLayer === 'transportation_name') continue
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

const ORM_LINE_LAYERS = ['orm-lines-low', 'orm-lines-high']
const ORM_STATION_LAYERS = ['orm-stations-low', 'orm-stations-med', 'orm-stations-high']

/**
 * Railway overlay on/off, and the basemap's streets. Streets are hidden by default: this
 * is a rail trip planner. The basemap's own thin rail lines go away while the overlay is on.
 */
function applyRailwaysAndStreets(map: maplibregl.Map, settings: Settings) {
  for (const id of ORM_LINE_LAYERS) {
    if (!map.getLayer(id)) continue
    map.setLayoutProperty(id, 'visibility', settings.showRailways ? 'visible' : 'none')
    map.setFilter(id, railFilter(settings.hiddenRailTypes))
  }
  for (const id of ORM_STATION_LAYERS)
    if (map.getLayer(id))
      map.setLayoutProperty(id, 'visibility', settings.showRailways && settings.showStations ? 'visible' : 'none')
  for (const layer of map.getStyle().layers) {
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer']
    if (sourceLayer !== 'transportation' && sourceLayer !== 'transportation_name') continue
    const isRail = layer.id.includes('rail')
    const show = isRail ? !settings.showRailways : settings.showStreets
    // Road names and shields also follow the "map text" setting
    const textAllowed = layer.type !== 'symbol' || settings.mapLabels === 'all'
    map.setLayoutProperty(layer.id, 'visibility', show && textAllowed ? 'visible' : 'none')
  }
}

// OpenRailwayMap standard colours: high-speed red, main lines orange, branch lines yellow...
const RAIL_COLOR = [
  'match',
  RAIL_TYPE,
  ...RAIL_TYPES.flatMap((t) => [t.id, t.color]),
  '#8e8e8e',
] as unknown as maplibregl.ExpressionSpecification

const IN_SERVICE: maplibregl.ExpressionSpecification = [
  'all',
  ['==', ['coalesce', ['get', 'state'], 'present'], 'present'],
  ['!', ['has', 'service']],
]

/** Lines in service whose type isn't switched off */
const railFilter = (hidden: string[]): maplibregl.FilterSpecification => [
  'all',
  IN_SERVICE,
  ['!', ['in', RAIL_TYPE, ['literal', hidden]]],
]

// Stations: no tram / metro stops, nothing closed
const STATION_FILTER: maplibregl.FilterSpecification = [
  'all',
  ['==', ['coalesce', ['get', 'state'], 'present'], 'present'],
  ['!', ['in', ['coalesce', ['get', 'feature'], ''], ['literal', ['tram_stop']]]],
  ['!', ['in', ['coalesce', ['get', 'station'], ''], ['literal', ['subway', 'tram', 'light_rail', 'monorail', 'funicular']]]],
]
const RAIL_RANK: maplibregl.ExpressionSpecification = [
  'case',
  ['to-boolean', ['get', 'highspeed']], 3,
  ['==', ['get', 'usage'], 'main'], 2,
  ['==', ['get', 'usage'], 'branch'], 1,
  0,
]
const RAIL_WIDTH: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  4, ['case', ['to-boolean', ['get', 'highspeed']], 1.6, ['==', ['get', 'usage'], 'main'], 1.2, 0.6],
  9, ['case', ['to-boolean', ['get', 'highspeed']], 3, ['==', ['get', 'usage'], 'main'], 2.4, 1.4],
  14, ['case', ['to-boolean', ['get', 'highspeed']], 5, ['==', ['get', 'usage'], 'main'], 4, 2.5],
]

// Our own text layers: never hidden by the "map text" setting
const OWN_SYMBOL_LAYERS = new Set(['cur-labels', 'travel-arrows'])

// One colour per currency zone
const CURRENCY_FILL = [
  'match',
  ['get', 'iso'],
  ...Object.entries(COUNTRY_CURRENCY).flatMap(([iso, code]) => [iso, CURRENCY_STYLE[code]?.color ?? '#94a3b8']),
  'rgba(0,0,0,0)',
] as unknown as maplibregl.ExpressionSpecification

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
  rates,
  groups,
  onAddFromMap,
  reach,
  reachHighlight,
  onTrainsFrom,
  onReachSelect,
  travel,
  lineHighlight,
  linePopup,
  onEditLine,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markers = useRef(new Map<string, maplibregl.Marker>())
  const currencyData = useMemo(() => currencyPoints(rates), [rates])
  const currencyRef = useRef(currencyData)
  currencyRef.current = currencyData
  // Latest values for map event handlers registered once
  const latest = useRef({ picking, onPick, onSelect, settings, onAddFromMap, onTrainsFrom, onEditLine, onReachSelect })
  latest.current = { picking, onPick, onSelect, settings, onAddFromMap, onTrainsFrom, onEditLine, onReachSelect }
  const showLinePopupRef = useRef<
    ((p: { id: string; kind: 'train' | 'plan'; title: string }, at: maplibregl.LngLatLike) => void) | null
  >(null)
  const travelRef = useRef(travel)
  travelRef.current = travel
  const reachRef = useRef(reach)
  reachRef.current = reach

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

      // OpenRailwayMap (vector): where the tracks run, styled like its standard view.
      // Low zooms use a simplified network, higher zooms the detailed one.
      const ORM = 'https://openrailwaymap.app/'
      const ormAttribution = '<a href="https://openrailwaymap.app/" target="_blank">OpenRailwayMap</a>'
      map.addSource('orm-low', {
        type: 'vector',
        tiles: [ORM + 'standard_railway_line_low/{z}/{x}/{y}'],
        maxzoom: 7,
        attribution: ormAttribution,
      })
      map.addSource('orm-high', {
        type: 'vector',
        tiles: [ORM + 'railway_line_high,railway_text_km/{z}/{x}/{y}'],
        minzoom: 7,
        maxzoom: 14,
        attribution: ormAttribution,
      })
      map.addSource('orm-stations-low', {
        type: 'vector',
        tiles: [ORM + 'standard_railway_text_stations_low/{z}/{x}/{y}'],
        minzoom: 4,
        maxzoom: 7,
      })
      map.addSource('orm-stations-med', {
        type: 'vector',
        tiles: [ORM + 'standard_railway_text_stations_med/{z}/{x}/{y}'],
        minzoom: 7,
        maxzoom: 8,
      })
      // From zoom 8 on: every station and halt, also the small ones
      map.addSource('orm-stations-high', {
        type: 'vector',
        tiles: [
          ORM +
            'standard_railway_text_stations,standard_railway_grouped_stations,standard_railway_grouped_station_areas,' +
            'standard_station_entrances,standard_railway_stop_positions,standard_interlocking,standard_interlocking_text/{z}/{x}/{y}',
        ],
        minzoom: 8,
        maxzoom: 14,
      })
      const visibility = latest.current.settings.showRailways ? 'visible' : 'none'
      const stationVisibility =
        latest.current.settings.showRailways && latest.current.settings.showStations ? 'visible' : 'none'
      for (const [id, source, layer, minzoom, maxzoom] of [
        ['orm-lines-low', 'orm-low', 'standard_railway_line_low', 0, 7],
        ['orm-lines-high', 'orm-high', 'railway_line_high', 7, 24],
      ] as const) {
        map.addLayer(
          {
            id,
            type: 'line',
            source,
            'source-layer': layer,
            minzoom,
            maxzoom,
            filter: railFilter(latest.current.settings.hiddenRailTypes),
            layout: { visibility, 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': RAIL_RANK },
            paint: { 'line-color': RAIL_COLOR, 'line-width': RAIL_WIDTH, 'line-opacity': 0.9 },
          },
          firstSymbol,
        )
      }
      for (const [id, layer, minzoom, maxzoom] of [
        ['orm-stations-low', 'standard_railway_text_stations_low', 4, 7],
        ['orm-stations-med', 'standard_railway_text_stations_med', 7, 8],
        ['orm-stations-high', 'standard_railway_text_stations', 8, 24],
      ] as const) {
        map.addLayer({
          id,
          type: 'circle',
          source: id,
          'source-layer': layer,
          minzoom,
          maxzoom,
          filter: STATION_FILTER,
          layout: { visibility: stationVisibility },
          paint: {
            'circle-color': '#ffffff',
            'circle-stroke-color': '#1e293b',
            'circle-stroke-width': 1.5,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.2, 8, 3.5, 12, 5],
          },
        })
      }

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
      applyRailwaysAndStreets(map, latest.current.settings)

      // Ferries with an Interrail benefit: included (teal, long dashes) and discount (grey, short dashes)
      map.addSource('ferries', { type: 'geojson', data: ferriesGeoJson })
      map.addLayer({
        id: 'ferry-discount',
        type: 'line',
        source: 'ferries',
        filter: ['!', ['get', 'included']],
        layout: { visibility: latest.current.settings.showFerriesDiscount ? 'visible' : 'none' },
        paint: { 'line-color': FERRY_STYLE.discount.color, 'line-width': 2.2, 'line-dasharray': [1, 1.6] },
      })
      map.addLayer({
        id: 'ferry-included',
        type: 'line',
        source: 'ferries',
        filter: ['get', 'included'],
        layout: { visibility: latest.current.settings.showFerriesIncluded ? 'visible' : 'none' },
        paint: { 'line-color': FERRY_STYLE.included.color, 'line-width': 3.2, 'line-dasharray': [2.5, 1.2] },
      })

      // Travel lines: train connections solid blue, general plans dashed purple
      const travelVisibility = latest.current.settings.showTravelLines ? 'visible' : 'none'
      map.addSource('travel', { type: 'geojson', data: travelGeoJson(travelRef.current) })
      map.addLayer({
        id: 'travel-casing',
        type: 'line',
        source: 'travel',
        filter: IS_LINE,
        layout: { 'line-cap': 'round', visibility: travelVisibility },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 },
      })
      map.addLayer({
        id: 'travel-highlight',
        type: 'line',
        source: 'travel',
        filter: ['==', ['get', 'id'], ''],
        layout: { 'line-cap': 'round', visibility: travelVisibility },
        paint: { 'line-color': '#facc15', 'line-width': 11, 'line-opacity': 0.8 },
      })
      map.addLayer({
        id: 'travel-train',
        type: 'line',
        source: 'travel',
        filter: ['all', IS_LINE, ['==', ['get', 'kind'], 'train']],
        layout: { 'line-cap': 'round', visibility: travelVisibility },
        paint: { 'line-color': LINE_KINDS.train.color, 'line-width': 4 },
      })
      map.addLayer({
        id: 'travel-plan',
        type: 'line',
        source: 'travel',
        filter: ['all', IS_LINE, ['==', ['get', 'kind'], 'plan']],
        layout: { 'line-cap': 'butt', visibility: travelVisibility },
        paint: { 'line-color': LINE_KINDS.plan.color, 'line-width': 3.5, 'line-dasharray': [2.2, 1.4] },
      })
      map.addLayer({
        id: 'travel-ends',
        type: 'circle',
        source: 'travel',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { visibility: travelVisibility },
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': ['match', ['get', 'kind'], 'train', LINE_KINDS.train.color, LINE_KINDS.plan.color],
        },
      })
      map.addLayer({
        id: 'travel-arrows',
        type: 'symbol',
        source: 'travel',
        filter: IS_LINE,
        layout: {
          visibility: travelVisibility,
          'symbol-placement': 'line',
          'symbol-spacing': 90,
          'text-field': '›',
          'text-font': ['Noto Sans Bold'],
          'text-size': 22,
          'text-keep-upright': false,
          'text-allow-overlap': true,
          'text-offset': [0, -0.08],
        },
        paint: {
          'text-color': ['match', ['get', 'kind'], 'train', LINE_KINDS.train.color, LINE_KINDS.plan.color],
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })

      // Direct trains: a light veil over everything else so the destinations stand out
      map.addSource('veil', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
        },
      })
      map.addLayer({
        id: 'reach-veil',
        type: 'fill',
        source: 'veil',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#0f172a', 'fill-opacity': 0.6 },
      })

      // Direct trains: one dot per reachable station, coloured by travel time
      map.addSource('reach', { type: 'geojson', data: reachGeoJson(reachRef.current) })
      map.addSource('reach-origin', { type: 'geojson', data: originGeoJson(reachRef.current) })
      map.addLayer({
        id: 'reach-dots',
        type: 'circle',
        source: 'reach',
        paint: {
          'circle-color': REACH_COLOR,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, ['interpolate', ['linear'], ['get', 'importance'], 0, 2.5, 0.5, 4.5],
            9, ['interpolate', ['linear'], ['get', 'importance'], 0, 5, 0.5, 8],
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.2,
        },
        // Important stations drawn on top
        layout: { 'circle-sort-key': ['get', 'importance'] },
      })
      map.addLayer({
        id: 'reach-highlight',
        type: 'circle',
        source: 'reach',
        filter: ['==', ['get', 'stopId'], ''],
        paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#facc15', 'circle-stroke-width': 4 },
      })
      map.addLayer({
        id: 'reach-origin',
        type: 'circle',
        source: 'reach-origin',
        paint: { 'circle-radius': 9, 'circle-color': '#0f172a', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
      })

      for (const id of ['reach-dots', 'ferry-included', 'ferry-discount', 'travel-train', 'travel-plan', ...ORM_STATION_LAYERS]) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
      }
    })

    function showReachPopup(p: { name: string; minutes: number; stopId: string }, [lng, lat]: [number, number]) {
      const el = document.createElement('div')
      el.className = 'add-popup'
      const title = document.createElement('strong')
      title.textContent = p.name
      const time = document.createElement('span')
      time.className = 'muted small'
      time.textContent = `${formatMinutes(p.minutes)} without changing`
      const trains = document.createElement('button')
      trains.textContent = '🚆 Direct trains from here'
      const add = document.createElement('button')
      add.className = 'primary'
      add.textContent = '+ Add to places'
      el.append(title, time, trains, add)
      const popup = new maplibregl.Popup({ className: 'map-popup', offset: 10, maxWidth: '240px' })
        .setLngLat([lng, lat])
        .setDOMContent(el)
        .addTo(map)
      trains.addEventListener('click', () => {
        latest.current.onTrainsFrom(p.name, lat, lng, true)
        popup.remove()
      })
      add.addEventListener('click', () => {
        latest.current.onAddFromMap(p.name, lat, lng, 'station')
        popup.remove()
      })
    }

    map.on('click', (e) => {
      const { picking, onPick, onSelect } = latest.current
      // Marker clicks stop propagation, so this is always a click on the map itself
      const { x, y } = e.point
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [x - 8, y - 8],
        [x + 8, y + 8],
      ]
      const hit = (layers: string[]) =>
        map.queryRenderedFeatures(box, { layers: layers.filter((id) => map.getLayer(id)) })[0]
      const featureName = (f: maplibregl.MapGeoJSONFeature) =>
        String(f.properties['name:en'] || f.properties.name_en || f.properties['name:latin'] || f.properties.name || '')
      const pointOf = (f: maplibregl.MapGeoJSONFeature) =>
        f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : ([e.lngLat.lng, e.lngLat.lat] as [number, number])

      if (picking) {
        // Snap to a station or town under the finger
        const station = hit(['reach-dots', ...ORM_STATION_LAYERS])
        const label = station ? null : hit(CLICKABLE_LAYERS)
        const f = station ?? label
        if (f) {
          const [lng, lat] = pointOf(f)
          onPick(lat, lng, { name: featureName(f), station: !!station || categoryFor(f) === 'station' })
        } else onPick(e.lngLat.lat, e.lngLat.lng)
        return
      }
      onSelect(null)

      // Most specific first: a direct-train result, a railway station, then any map label
      const reachHit = hit(['reach-dots'])
      if (reachHit) {
        latest.current.onReachSelect(String(reachHit.properties.stopId))
        showReachPopup(
          reachHit.properties as { name: string; minutes: number; stopId: string },
          (reachHit.geometry as GeoJSON.Point).coordinates as [number, number],
        )
        return
      }
      const stationHit = hit(ORM_STATION_LAYERS)
      if (stationHit) {
        showStationPopup(
          String(stationHit.properties.name || stationHit.properties.label || ''),
          (stationHit.geometry as GeoJSON.Point).coordinates as [number, number],
        )
        return
      }
      const lineHit = hit(['travel-train', 'travel-plan'])
      if (lineHit) {
        showLinePopup(lineHit.properties as { id: string; kind: 'train' | 'plan'; title: string }, e.lngLat)
        return
      }
      const ferryHit = hit(['ferry-included', 'ferry-discount'])
      if (ferryHit) {
        showFerryPopup(Number(ferryHit.properties.i), e.lngLat)
        return
      }
      const labelHit = hit(CLICKABLE_LAYERS)
      if (labelHit) showAddPopup(labelHit, e.lngLat)
    })

    function showFerryPopup(i: number, at: maplibregl.LngLat) {
      const f = FERRIES[i]
      if (!f) return
      const el = document.createElement('div')
      el.className = 'add-popup'
      const title = document.createElement('strong')
      title.textContent = `⛴️ ${f.name}`
      const op = document.createElement('span')
      op.className = 'muted small no-caps'
      op.textContent = f.operator
      const badge = document.createElement('span')
      badge.className = 'cov-badge no-caps ' + (f.included ? 'good' : 'warn')
      badge.textContent = f.included ? '✓ Included in the pass' : '% Discount with the pass'
      const text = document.createElement('p')
      text.className = 'small no-caps ferry-benefit'
      text.textContent = f.benefit
      const link = document.createElement('a')
      link.href = FERRY_INFO_URL
      link.target = '_blank'
      link.rel = 'noreferrer'
      link.className = 'small'
      link.textContent = 'Details on interrail.com ↗'
      el.append(title, op, badge, text, link)
      new maplibregl.Popup({ className: 'map-popup', offset: 6, maxWidth: '280px' }).setLngLat(at).setDOMContent(el).addTo(map)
    }

    showLinePopupRef.current = showLinePopup
    function showLinePopup(p: { id: string; kind: 'train' | 'plan'; title: string }, at: maplibregl.LngLatLike) {
      const el = document.createElement('div')
      el.className = 'add-popup'
      const title = document.createElement('strong')
      title.textContent = p.title
      const kind = document.createElement('span')
      kind.className = 'muted small'
      kind.className = 'muted small no-caps'
      kind.textContent = `${LINE_KINDS[p.kind].icon} ${LINE_KINDS[p.kind].label}`
      const edit = document.createElement('button')
      edit.textContent = '✏️ Edit line'
      el.append(title, kind)
      // Train connection: list its trains and stops
      const legs = travelRef.current.find((l) => l.id === p.id)?.legs
      if (p.kind === 'train' && legs?.length) {
        const sum = legSummary(legs)
        const s = document.createElement('div')
        s.className = 'coverage-summary small ' + sum.tone
        s.textContent = `${sum.icon} ${sum.text}`
        const list = document.createElement('ol')
        list.className = 'route-legs popup-legs'
        for (const l of legs) {
          const c = COVERAGE_LABEL[coverage(l.agency, l.mode)]
          const li = document.createElement('li')
          const head = document.createElement('b')
          head.textContent = `${l.mode === 'FERRY' ? '⛴️' : '🚆'} ${l.name || (l.mode === 'FERRY' ? 'Ferry' : 'Train')} `
          const badge = document.createElement('span')
          badge.className = 'cov-badge ' + c.tone
          badge.textContent = `${c.icon} ${c.text}`
          const when = document.createElement('div')
          when.className = 'small'
          when.textContent = `${timeOf(l.departure)} ${l.from} → ${timeOf(l.arrival)} ${l.to}`
          li.append(head, badge, when)
          if (l.stops?.length) {
            const stops = document.createElement('div')
            stops.className = 'muted small'
            stops.textContent = 'via ' + l.stops.join(', ')
            li.append(stops)
          }
          list.append(li)
        }
        el.append(s, list)
      }
      el.append(edit)
      const popup = new maplibregl.Popup({ className: 'map-popup', offset: 6, maxWidth: '320px' })
        .setLngLat(at)
        .setDOMContent(el)
        .addTo(map)
      edit.addEventListener('click', () => {
        latest.current.onEditLine(p.id)
        popup.remove()
      })
    }

    /** Railway station dot: its full name, plus direct trains / add */
    function showStationPopup(name: string, [lng, lat]: [number, number]) {
      if (!name) return
      const el = document.createElement('div')
      el.className = 'add-popup'
      const title = document.createElement('strong')
      title.textContent = name
      const kind = document.createElement('span')
      kind.className = 'muted small'
      kind.textContent = 'Railway station'
      const trains = document.createElement('button')
      trains.textContent = '🚆 Direct trains'
      const add = document.createElement('button')
      add.className = 'primary'
      add.textContent = '+ Add to places'
      el.append(title, kind, trains, add)
      const popup = new maplibregl.Popup({ className: 'map-popup', offset: 8, maxWidth: '240px' })
        .setLngLat([lng, lat])
        .setDOMContent(el)
        .addTo(map)
      trains.addEventListener('click', () => {
        latest.current.onTrainsFrom(name, lat, lng, true)
        popup.remove()
      })
      add.addEventListener('click', () => {
        latest.current.onAddFromMap(name, lat, lng, 'station')
        popup.remove()
      })
    }

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
      const category = categoryFor(f)
      if (category === 'station' || category === 'city') {
        const trains = document.createElement('button')
        trains.textContent = '🚆 Direct trains'
        trains.addEventListener('click', () => {
          latest.current.onTrainsFrom(name, lat, lng, category === 'station')
          popup.remove()
        })
        el.append(trains)
        // A town: only offer direct trains if a railway station is there
        if (category === 'city') {
          trains.disabled = true
          trains.textContent = '🚆 Checking for trains…'
          findStation(name, lat, lng)
            .then((s) => {
              trains.disabled = !s
              trains.textContent = s ? '🚆 Direct trains' : '🚆 No trains here'
              trains.title = s ? `From ${s.name}` : 'No railway station near this place'
            })
            .catch(() => {
              trains.disabled = false
              trains.textContent = '🚆 Direct trains'
            })
        }
      }
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
    applyRailwaysAndStreets(map, settings)
  }, [settings, mapRef])

  // Direct trains: update dots and zoom to show them all
  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource('reach') as maplibregl.GeoJSONSource | undefined
    if (!map || !source) return
    source.setData(reachGeoJson(reach))
    ;(map.getSource('reach-origin') as maplibregl.GeoJSONSource).setData(originGeoJson(reach))
    if (!reach || reach.destinations.length === 0) return
    const bounds = new maplibregl.LngLatBounds([reach.origin.lng, reach.origin.lat], [reach.origin.lng, reach.origin.lat])
    for (const d of reach.destinations) bounds.extend([d.lng, d.lat])
    map.fitBounds(bounds, { padding: 60, maxZoom: 9 })
  }, [reach, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer('reach-highlight')) map.setFilter('reach-highlight', ['==', ['get', 'stopId'], reachHighlight ?? ''])
  }, [reachHighlight, mapRef])

  // Fade the rest of the map while direct-train results are shown
  const faded = !!reach && settings.reachFocus
  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer('reach-veil')) map.setLayoutProperty('reach-veil', 'visibility', faded ? 'visible' : 'none')
  }, [faded, mapRef])

  useEffect(() => {
    const source = mapRef.current?.getSource('travel') as maplibregl.GeoJSONSource | undefined
    source?.setData(travelGeoJson(travel))
  }, [travel, mapRef])

  // Popup for a line picked in the list, at the middle of its route
  useEffect(() => {
    if (!linePopup) return
    const line = travelRef.current.find((l) => l.id === linePopup.id)
    if (!line) return
    const mid = line.coords.length > 2 ? line.coords[Math.floor(line.coords.length / 2)] : [
      (line.coords[0][0] + line.coords[1][0]) / 2,
      (line.coords[0][1] + line.coords[1][1]) / 2,
    ] as [number, number]
    document.querySelectorAll('.maplibregl-popup').forEach((p) => p.remove())
    showLinePopupRef.current?.({ id: line.id, kind: line.kind, title: line.title }, mid)
  }, [linePopup])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer('travel-highlight')) map.setFilter('travel-highlight', ['==', ['get', 'id'], lineHighlight ?? ''])
  }, [lineHighlight, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('ferry-included')) return
    map.setLayoutProperty('ferry-included', 'visibility', settings.showFerriesIncluded ? 'visible' : 'none')
    map.setLayoutProperty('ferry-discount', 'visibility', settings.showFerriesDiscount ? 'visible' : 'none')
  }, [settings.showFerriesIncluded, settings.showFerriesDiscount, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('travel-train')) return
    for (const id of ['travel-casing', 'travel-highlight', 'travel-train', 'travel-plan', 'travel-ends', 'travel-arrows'])
      map.setLayoutProperty(id, 'visibility', settings.showTravelLines ? 'visible' : 'none')
  }, [settings.showTravelLines, mapRef])

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

    // A focused stop overrides the layer toggles: show exactly its pins
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
          if (latest.current.picking) {
            const m = markers.current.get(key)?.getLngLat()
            if (m)
              latest.current.onPick(m.lat, m.lng, w.sel?.kind === 'person' ? { personId: w.sel.id } : { placeId: w.sel!.id })
            return
          }
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
  if (faded) classes.push('faded')
  if (settings.showPlaceLabels) classes.push('labels-place')
  if (settings.showPeopleLabels) classes.push('labels-person')
  return <div ref={containerRef} className={classes.join(' ')} />
}
