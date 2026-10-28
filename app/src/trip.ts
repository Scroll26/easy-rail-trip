import { addDays, daysBetween, today as todayDate } from './dates'
import { listOrder, newId, nextTripOrder, saveLine, saveStop } from './store'
import { currentRoute, resolveEndpoint } from './lines'
import type { Activity, Person, Place, PlaceStatus, Stop, TravelLine } from './types'

export interface Lookup {
  places: Map<string, Place>
  people: Map<string, Person>
}

/** Order value between two neighbours (either may be missing) */
export function between(prev: number | undefined, next: number | undefined) {
  if (prev != null && next != null) return (prev + next) / 2
  if (prev != null) return prev + 1
  if (next != null) return next - 1
  return 1
}

export type TripEntry =
  | {
      kind: 'stop'
      id: string
      order: number
      stop: Stop
      arrive: string
      /** Day you leave (arrive + nights) */
      depart: string
      /** Nights between the previous entry and a fixed arrival date: > 0 unplanned, < 0 overlapping */
      gap: number
    }
  | {
      kind: 'line'
      id: string
      order: number
      line: TravelLine
      /** Day it leaves */
      date: string
      /** Day it arrives (the next one for night trains) */
      arrive: string
    }

export interface Trip {
  entries: TripEntry[]
  start: string
  /** Last day of the trip (the day you leave the last stop or arrive with the last connection) */
  end: string
  /** False when nothing set the dates yet (no start date, no fixed date): they count from today */
  dated: boolean
}

/**
 * Lays the stops and connections out in time: each stop starts where the one before ends
 * (unless its arrival date is fixed), so a longer stay pushes everything after it.
 */
export function buildTrip(stops: Stop[], lines: TravelLine[], tripStart: string | null): Trip {
  const sorted = [
    ...stops.map((s) => ({ kind: 'stop' as const, order: s.order, s })),
    ...lines.map((l) => ({ kind: 'line' as const, order: listOrder(l), l })),
  ].sort((a, b) => a.order - b.order)
  const firstFixed = sorted.find((e) => e.kind === 'stop' && e.s.fixedDate)
  const start =
    tripStart ?? (firstFixed?.kind === 'stop' ? firstFixed.s.fixedDate : null) ?? todayDate()
  let cursor = start
  const entries: TripEntry[] = sorted.map((e) => {
    if (e.kind === 'stop') {
      const arrive = e.s.fixedDate ?? cursor
      const gap = daysBetween(cursor, arrive)
      cursor = addDays(arrive, e.s.nights)
      return { kind: 'stop', id: e.s.id, order: e.order, stop: e.s, arrive, depart: cursor, gap }
    }
    const date = cursor
    cursor = e.l.overnight ? addDays(date, 1) : date
    return { kind: 'line', id: e.l.id, order: e.order, line: e.l, date, arrive: cursor }
  })
  return { entries, start, end: cursor, dated: !!tripStart || !!firstFixed }
}

export const tripStops = (trip: Trip) =>
  trip.entries.filter((e): e is Extract<TripEntry, { kind: 'stop' }> => e.kind === 'stop')
export const tripLines = (trip: Trip) =>
  trip.entries.filter((e): e is Extract<TripEntry, { kind: 'line' }> => e.kind === 'line')
export type StopEntry = ReturnType<typeof tripStops>[number]
export type LineEntry = ReturnType<typeof tripLines>[number]

/** The stop where you sleep on the night of `date` */
export const stopForNight = (trip: Trip, date: string) =>
  tripStops(trip).find((s) => s.arrive <= date && date < s.depart) ?? null

/** Travel days: the distinct days a connection leaves (a night train counts once) */
export const travelDays = (trip: Trip) => new Set(tripLines(trip).map((l) => l.date)).size

/** Days of a stop to plan activities on: arrival day … departure day */
export const stopDays = (stop: StopEntry) => Math.max(1, stop.stop.nights + 1)

/** Day of an activity within its stop; a stop that got shorter moves it to its last day */
export const activityDay = (a: Activity, stop: StopEntry) => (a.day == null ? null : Math.min(a.day, stopDays(stop) - 1))

/** Calendar day of an activity, or null when it's "sometime during the stop" */
export function activityDate(a: Activity, stop: StopEntry) {
  const d = activityDay(a, stop)
  return d == null ? null : addDays(stop.arrive, d)
}

/** First and last day each place is part of the trip (as a stop, a bed or an activity) */
export function placesInTrip(trip: Trip, activities: Activity[]) {
  const m = new Map<string, { first: string; last: string }>()
  const add = (id: string | null | undefined, first: string, last: string) => {
    if (!id) return
    const cur = m.get(id)
    m.set(id, cur ? { first: cur.first < first ? cur.first : first, last: cur.last > last ? cur.last : last } : { first, last })
  }
  const byId = new Map<string, StopEntry>()
  for (const s of tripStops(trip)) {
    byId.set(s.id, s)
    add(s.stop.placeId, s.arrive, s.depart)
    add(s.stop.stay?.placeId, s.arrive, s.depart)
  }
  for (const a of activities) {
    const s = byId.get(a.stopId)
    if (!s) continue
    const d = activityDate(a, s)
    add(a.placeId, d ?? s.arrive, d ?? s.depart)
  }
  return m
}

/** Status shown for a place: automatic while it's in the trip, your own choice otherwise */
export function statusOf(place: Place, inTrip: Map<string, { first: string; last: string }>, today = todayDate()): PlaceStatus {
  const t = inTrip.get(place.id)
  if (t) return t.last < today ? 'visited' : 'planned'
  return place.status === 'visited' ? 'visited' : 'idea'
}

/** Short summary of a connection's trains: first departure, train names, reservations */
export function lineTrains(line: TravelLine, lookup: Lookup) {
  const legs = currentRoute(line, lookup)?.legs ?? []
  return {
    legs,
    departure: legs[0]?.departure,
    arrival: legs[legs.length - 1]?.arrival,
    names: legs.map((l) => l.name).filter(Boolean) as string[],
    reservation: legs.some((l) => l.reservation),
  }
}

/** Order values for `count` new entries right after `afterId` (or at the end) */
export function ordersAfter(trip: Trip, afterId: string | null, count: number, endOrder: number) {
  const i = afterId ? trip.entries.findIndex((e) => e.id === afterId) : -1
  if (i < 0) return Array.from({ length: count }, (_, k) => endOrder + k)
  let prev = trip.entries[i].order
  const next = trip.entries[i + 1]?.order
  return Array.from({ length: count }, () => (prev = between(prev, next)))
}

/** Rough distance in km, for "nearest stop" suggestions */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6371
}

/** The stop closest to a point */
export function nearestStop(trip: Trip, lookup: Lookup, at: { lat: number; lng: number }) {
  let best: { stop: StopEntry; km: number } | null = null
  for (const s of tripStops(trip)) {
    const p = lookup.places.get(s.stop.placeId)
    if (!p) continue
    const d = km(p, at)
    if (!best || d < best.km) best = { stop: s, km: d }
  }
  return best
}

/** Name of a stop's bed: the pin, the person or the free name */
export function stayName(stop: Stop, lookup: Lookup) {
  const s = stop.stay
  if (!s) return ''
  const place = s.placeId ? lookup.places.get(s.placeId) : undefined
  if (place) return place.name || 'Unnamed'
  const person = s.personId ? lookup.people.get(s.personId) : undefined
  if (person) return `with ${person.name || 'Unnamed'}`
  return s.name
}

/** Ends of a new connection between two stops, following their pins */
export function stopEndpoint(stop: Stop, lookup: Lookup) {
  const p = lookup.places.get(stop.placeId)
  return resolveEndpoint({ placeId: stop.placeId, name: p?.name ?? '', lat: p?.lat ?? 0, lng: p?.lng ?? 0 }, lookup)
}

/** Adds a stop at the end of the trip, with a rough plan from the stop before. Returns its id. */
export function appendStop(trip: Trip, lookup: Lookup, place: Place) {
  const now = Date.now()
  const last = trip.entries[trip.entries.length - 1]
  const order = nextTripOrder()
  const id = newId()
  saveStop({ id, placeId: place.id, nights: 1, fixedDate: null, stay: null, notes: '', order: order + 1, createdAt: now, updatedAt: now })
  if (last?.kind === 'stop')
    saveLine({
      id: newId(),
      kind: 'plan',
      from: stopEndpoint(last.stop, lookup),
      to: { placeId: place.id, name: place.name, lat: place.lat, lng: place.lng },
      notes: '',
      order,
      createdAt: now,
      updatedAt: now,
    })
  return id
}
