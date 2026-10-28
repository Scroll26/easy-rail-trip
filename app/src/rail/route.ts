import type { RouteLeg } from '../types'
import { countriesAlong, countryAt, loadCountries } from '../countries'
import { HUBS } from '../data/hubs'

// Train connections drawn along the tracks: the route comes from the Transitous
// journey planner (one request per line, then stored with the line and synced).

const API = 'https://api.transitous.org/api'
// Ferries too: some are part of the pass (each leg is checked against the Interrail list)
const MODES = 'HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_FAST_RAIL,REGIONAL_RAIL,RAIL,FERRY'

/** Bump when RouteLeg gets new fields, so stored routes are looked up again */
export const ROUTE_VERSION = 4

export interface RailRoute {
  path: [number, number][]
  legs: RouteLeg[]
  /** Countries the route runs through, in order (ISO codes) */
  countries: string[]
}

/** Google encoded polyline → [lng, lat] pairs */
function decodePolyline(str: string, precision: number): [number, number][] {
  const factor = 10 ** precision
  const out: [number, number][] = []
  let lat = 0
  let lng = 0
  let i = 0
  const next = () => {
    let result = 0
    let shift = 0
    let b: number
    do {
      b = str.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < str.length) {
    lat += next()
    lng += next()
    out.push([lng / factor, lat / factor])
  }
  return out
}

/** Douglas–Peucker: keep the shape, drop points closer than `tolerance` degrees to it */
export function simplify(points: [number, number][], tolerance = 0.0008): [number, number][] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [x1, y1] = points[a]
    const [x2, y2] = points[b]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = dx * dx + dy * dy || 1e-12
    let max = 0
    let idx = -1
    for (let k = a + 1; k < b; k++) {
      const [x, y] = points[k]
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len))
      const d = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2
      if (d > max) {
        max = d
        idx = k
      }
    }
    if (idx >= 0 && max > tolerance * tolerance) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, k) => keep[k])
}

/** Next Wednesday 08:00 local: a normal weekday timetable */
function typicalDeparture() {
  const d = new Date()
  d.setDate(d.getDate() + (((3 - d.getDay() + 7) % 7) || 7))
  d.setHours(8, 0, 0, 0)
  return d.toISOString()
}

type Leg = {
  mode: string
  from: { name: string; lat: number; lon: number }
  to: { name: string; lat: number; lon: number }
  agencyName?: string
  displayName?: string
  routeShortName?: string
  tripShortName?: string
  startTime?: string
  endTime?: string
  intermediateStops?: { name: string; lat: number; lon: number }[]
  reservation?: 'NONE' | 'COMPULSORY'
  legGeometry?: { points: string; precision: number }
}

type Point = { lat: number; lng: number }

async function plan(from: Point, to: Point, extra: Record<string, string>) {
  const params = new URLSearchParams({
    fromPlace: `${from.lat},${from.lng}`,
    toPlace: `${to.lat},${to.lng}`,
    time: typicalDeparture(),
    transitModes: MODES,
    detailedTransfers: 'false',
    maxPreTransitTime: '1200',
    maxPostTransitTime: '1200',
    ...extra,
  })
  const res = await fetch(`${API}/v6/plan?${params}`)
  if (!res.ok) throw new Error(`Route lookup failed (${res.status})`)
  const j = (await res.json()) as { itineraries?: { legs: Leg[] }[] }
  return (j.itineraries ?? [])
    .map((it) => it.legs.filter((l) => l.mode !== 'WALK' && l.legGeometry))
    .filter((legs) => legs.length)
}

const fullPath = (legs: Leg[]) => legs.flatMap((l) => decodePolyline(l.legGeometry!.points, l.legGeometry!.precision))

const round = ([x, y]: [number, number]): [number, number] => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]

function toRoute(legs: Leg[], countries: string[]): RailRoute {
  const paths = legs.map((l) => simplify(decodePolyline(l.legGeometry!.points, l.legGeometry!.precision)).map(round))
  return {
    path: paths.flat(),
    legs: legs.map((l, i) => ({
      from: l.from.name,
      to: l.to.name,
      fromAt: round([l.from.lon, l.from.lat]),
      toAt: round([l.to.lon, l.to.lat]),
      path: paths[i],
      stopsAt: (l.intermediateStops ?? []).map((s) => round([s.lon, s.lat])),
      agency: l.agencyName ?? '',
      mode: l.mode,
      name: l.displayName || l.routeShortName || l.tripShortName || '',
      departure: l.startTime,
      arrival: l.endTime,
      stops: (l.intermediateStops ?? []).map((s) => s.name),
      reservation: l.reservation === 'COMPULSORY',
    })),
    countries,
  }
}

const hubIds = new Map<string, Promise<string | null>>()

/** The planner's stop id of a hub station (looked up once) */
type Hub = (typeof HUBS)[number]

function hubId([name, lat, lng]: Hub) {
  if (!hubIds.has(name))
    hubIds.set(
      name,
      fetch(`${API}/v1/geocode?${new URLSearchParams({ text: name, type: 'STOP' })}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list: { id: string; lat: number; lon: number }[]) => list.find((s) => km({ lat, lng }, { lat: s.lat, lng: s.lon }) < 3)?.id ?? null)
        .catch(() => null),
    )
  return hubIds.get(name)!
}

/** Points every few km along straight lines, to test which countries they cross */
function densify(points: [number, number][]) {
  const out: [number, number][] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    const n = Math.ceil(km({ lat: y1, lng: x1 }, { lat: y2, lng: x2 }) / 4)
    for (let k = 1; k <= n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n])
  }
  return out
}

function km(a: Point, b: Point) {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  return Math.sqrt(x * x + ((b.lat - a.lat) * rad) ** 2) * 6371
}

/**
 * Rail route between two points (with changes if needed), or null if trains don't connect them.
 * Countries in `avoid` are kept off the route where possible: other suggestions of the planner
 * first, then routes via a big hub elsewhere. If nothing works, the normal route comes back and
 * its `countries` show what it passes through.
 */
export async function railRoute(from: Point, to: Point, avoid: string[] = []): Promise<RailRoute | null> {
  const shapes = await loadCountries()
  const ends = new Set([countryAt(shapes, from.lat, from.lng)?.iso, countryAt(shapes, to.lat, to.lng)?.iso])
  // Where the trip starts or ends can't be avoided
  const banned = avoid.filter((iso) => !ends.has(iso))
  const options = await plan(from, to, { numItineraries: banned.length ? '5' : '1' })
  if (!options.length) return null
  if (!banned.length) return toRoute(options[0], countriesAlong(shapes, fullPath(options[0])))

  const check = (legs: Leg[]) => {
    const countries = countriesAlong(shapes, fullPath(legs))
    return { legs, countries, ok: !countries.some((c) => banned.includes(c)) }
  }
  const first = check(options[0])
  const clean = [first, ...options.slice(1).map(check)].find((o) => o.ok)
  if (clean) return toRoute(clean.legs, clean.countries)

  // Via one or two hubs: only where the straight line between them stays out of the avoided
  // countries, the shortest such detours first
  const direct = km(from, to)
  const hubs = HUBS.filter(([, lat, lng, iso]) => !banned.includes(iso) && km(from, { lat, lng }) > 30 && km({ lat, lng }, to) > 30)
  const pt = ([, lat, lng]: Hub) => ({ lat, lng })
  const tries: { via: Hub[]; length: number }[] = []
  const consider = (via: Hub[]) => {
    const points = [from, ...via.map(pt), to]
    const length = points.slice(1).reduce((sum, p, i) => sum + km(points[i], p), 0)
    if (length > direct * 1.6) return
    const line = densify(points.map((p) => [p.lng, p.lat] as [number, number]))
    if (!countriesAlong(shapes, line).some((c) => banned.includes(c))) tries.push({ via, length })
  }
  for (const h of hubs) consider([h])
  for (const h1 of hubs) for (const h2 of hubs) if (h1 !== h2 && km(from, pt(h1)) < km(from, pt(h2))) consider([h1, h2])
  tries.sort((x, y) => x.length - y.length)
  for (const t of tries.slice(0, 4)) {
    const ids = await Promise.all(t.via.map(hubId))
    if (ids.some((id) => !id)) continue
    const found = (await plan(from, to, { via: ids.join(','), numItineraries: '3' }).catch(() => [])).map(check).find((o) => o.ok)
    if (found) return toRoute(found.legs, found.countries)
  }
  return toRoute(first.legs, first.countries)
}
