import type { Endpoint, LineKind, TravelLine } from './types'
import type { Lookup } from './timeline'

export const LINE_KINDS: Record<LineKind, { label: string; icon: string; color: string; hint: string }> = {
  train: { label: 'Train connection', icon: '🚆', color: '#2563eb', hint: 'a concrete train, station to station' },
  plan: { label: 'General plan', icon: '🧭', color: '#9333ea', hint: 'roughly where to go next, city to city' },
}

/** Current position and name of a line end: pins are followed, fixed points stay */
export function resolveEndpoint(e: Endpoint, { places, people }: Lookup): Endpoint {
  const place = e.placeId ? places.get(e.placeId) : undefined
  if (place) return { ...e, name: place.name || e.name, lat: place.lat, lng: place.lng }
  const person = e.personId ? people.get(e.personId) : undefined
  if (person?.lat != null && person.lng != null)
    return { ...e, name: person.name || e.name, lat: person.lat, lng: person.lng }
  return e
}

export function lineTitle(line: TravelLine, lookup: Lookup) {
  return `${resolveEndpoint(line.from, lookup).name || '?'} → ${resolveEndpoint(line.to, lookup).name || '?'}`
}

export interface DrawnLine {
  id: string
  kind: LineKind
  title: string
  coords: [number, number][]
}

/** Identifies the ends a route was looked up for; a moved pin makes it stale */
export function routeKey(line: TravelLine, lookup: Lookup) {
  const a = resolveEndpoint(line.from, lookup)
  const b = resolveEndpoint(line.to, lookup)
  return [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(4)).join(',')
}

/** The stored rail route of a train connection, if it's still for the current ends */
export function currentRoute(line: TravelLine, lookup: Lookup) {
  return line.kind === 'train' && line.route?.key === routeKey(line, lookup) ? line.route : null
}

export function drawnLines(lines: TravelLine[], lookup: Lookup): DrawnLine[] {
  return lines.map((l) => {
    const a = resolveEndpoint(l.from, lookup)
    const b = resolveEndpoint(l.to, lookup)
    const path = currentRoute(l, lookup)?.path
    // Train connections follow the tracks; general plans (and unrouted lines) go straight
    const coords: [number, number][] = path?.length
      ? [[a.lng, a.lat], ...path, [b.lng, b.lat]]
      : [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ]
    return { id: l.id, kind: l.kind, title: `${a.name} → ${b.name}`, coords }
  })
}
