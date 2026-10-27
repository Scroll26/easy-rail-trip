import type { RouteLeg } from '../types'

// Train connections drawn along the tracks: the route comes from the Transitous
// journey planner (one request per line, then stored with the line and synced).

const API = 'https://api.transitous.org/api'
// Ferries too: some are part of the pass (each leg is checked against the Interrail list)
const MODES = 'HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_FAST_RAIL,REGIONAL_RAIL,RAIL,FERRY'

/** Bump when RouteLeg gets new fields, so stored routes are looked up again */
export const ROUTE_VERSION = 2

export interface RailRoute {
  path: [number, number][]
  legs: RouteLeg[]
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

/** Rail route between two points (with changes if needed), or null if trains don't connect them */
export async function railRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RailRoute | null> {
  const params = new URLSearchParams({
    fromPlace: `${from.lat},${from.lng}`,
    toPlace: `${to.lat},${to.lng}`,
    time: typicalDeparture(),
    transitModes: MODES,
    numItineraries: '1',
    detailedTransfers: 'false',
    maxPreTransitTime: '1200',
    maxPostTransitTime: '1200',
  })
  const res = await fetch(`${API}/v6/plan?${params}`)
  if (!res.ok) throw new Error(`Route lookup failed (${res.status})`)
  const j = (await res.json()) as {
    itineraries?: {
      legs: {
        mode: string
        from: { name: string }
        to: { name: string }
        agencyName?: string
        displayName?: string
        routeShortName?: string
        tripShortName?: string
        startTime?: string
        endTime?: string
        intermediateStops?: { name: string }[]
        reservation?: 'NONE' | 'COMPULSORY'
        legGeometry?: { points: string; precision: number }
      }[]
    }[]
  }
  const legs = (j.itineraries?.[0]?.legs ?? []).filter((l) => l.mode !== 'WALK' && l.legGeometry)
  if (!legs.length) return null
  const path = simplify(legs.flatMap((l) => decodePolyline(l.legGeometry!.points, l.legGeometry!.precision)))
  return {
    path: path.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as [number, number]),
    legs: legs.map((l) => ({
      from: l.from.name,
      to: l.to.name,
      agency: l.agencyName ?? '',
      mode: l.mode,
      name: l.displayName || l.routeShortName || l.tripShortName || '',
      departure: l.startTime,
      arrival: l.endTime,
      stops: (l.intermediateStops ?? []).map((s) => s.name),
      reservation: l.reservation === 'COMPULSORY',
    })),
  }
}
