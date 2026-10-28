import { ROUTE_VERSION } from './rail/route'
import { coverage } from './data/interrailOperators'
import type { Endpoint, LineKind, RouteLeg, TravelLine } from './types'
import type { Lookup } from './trip'

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
  /** Train connections: the trains along the route */
  legs?: RouteLeg[]
}

/** A train or station of a connection, highlighted on the map */
export interface RouteFocus {
  key: string
  path?: [number, number][]
  /** Stations to mark, with their names */
  points: { at: [number, number]; name: string }[]
}

/** Colours of the trains of an open connection, in turn (on the map and their cards) */
export const SECTION_COLORS = ['#1d4ed8', '#111827', '#7c3aed', '#0e7490']
export const sectionColor = (i: number) => SECTION_COLORS[i % SECTION_COLORS.length]

/** Highlight for one train of a connection: its track and both end stations */
export function legFocus(leg: RouteLeg, i: number): RouteFocus {
  return {
    key: `leg:${i}`,
    path: leg.path,
    points: [
      { at: leg.fromAt!, name: leg.from },
      { at: leg.toAt!, name: leg.to },
    ].filter((p) => p.at),
  }
}

export const timeOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

/** Is the whole connection covered by the Interrail pass? */
export function legSummary(legs: RouteLeg[]): { icon: string; text: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  const c = legs.map((l) => coverage(l.agency, l.mode))
  const reservations = legs.filter((l) => l.reservation).length
  const changes = legs.length - 1
  const how = changes ? `${changes} change${changes > 1 ? 's' : ''}` : 'direct'
  if (c.includes('not')) return { icon: '✕', text: `Not fully covered by Interrail (${how})`, tone: 'bad' }
  if (c.includes('unknown')) return { icon: '?', text: `Partly unclear, check the operators (${how})`, tone: 'neutral' }
  const extra = [
    c.includes('domestic') ? 'some legs domestic only' : '',
    c.includes('ferry-discount') ? 'ferry at a discount' : '',
    reservations ? `${reservations} reservation${reservations > 1 ? 's' : ''} needed` : '',
  ].filter(Boolean)
  return {
    icon: '✓',
    text: `Covered by Interrail (${how}${extra.length ? ', ' + extra.join(', ') : ''})`,
    tone: extra.length ? 'warn' : 'good',
  }
}

/** Countries this connection stays out of: its own choice, else the default */
export const avoidOf = (line: TravelLine, lookup: Lookup) => line.avoid ?? lookup.avoid

/** Identifies the ends (and avoided countries) a route was looked up for; a moved pin makes it stale */
export function routeKey(line: TravelLine, lookup: Lookup) {
  const a = resolveEndpoint(line.from, lookup)
  const b = resolveEndpoint(line.to, lookup)
  const avoid = [...avoidOf(line, lookup)].sort().join('+')
  return `v${ROUTE_VERSION}:` + [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(4)).join(',') + (avoid ? `!${avoid}` : '')
}

/** The stored rail route of a train connection, if it's still for the current ends */
export function currentRoute(line: TravelLine, lookup: Lookup) {
  return line.kind === 'train' && line.route?.key === routeKey(line, lookup) ? line.route : null
}

/** Avoided countries the stored route still runs through (the start and end country don't count) */
export function avoidedOnRoute(line: TravelLine, lookup: Lookup): string[] {
  const c = currentRoute(line, lookup)?.countries ?? []
  return avoidOf(line, lookup).filter((iso) => c.slice(1, -1).includes(iso) && iso !== c[0] && iso !== c[c.length - 1])
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
    return { id: l.id, kind: l.kind, title: `${a.name} → ${b.name}`, coords, legs: currentRoute(l, lookup)?.legs }
  })
}
