import { CATEGORIES } from './data/categories'
import { addDays, daysBetween } from './dates'
import { newId, nextOrder } from './store'
import type { DayInfo, ItemType, Person, Place, TimelineItem } from './types'

export const UNSCHEDULED = 'unscheduled'

export interface Lookup {
  places: Map<string, Place>
  people: Map<string, Person>
}

export interface ItemView {
  icon: string
  title: string
  subtitle: string
  /** Map marker key ('place:id' / 'person:id') this item points at, if any */
  markerKey: string | null
  lat: number | null
  lng: number | null
}

export function describeItem(item: TimelineItem, { places, people }: Lookup): ItemView {
  const none = { markerKey: null, lat: null, lng: null }
  switch (item.type) {
    case 'place': {
      const p = item.placeId ? places.get(item.placeId) : undefined
      if (!p) return { icon: '📍', title: 'Missing place', subtitle: '', ...none }
      return {
        icon: CATEGORIES[p.category].icon,
        title: p.name || 'Unnamed',
        subtitle: item.notes,
        markerKey: 'place:' + p.id,
        lat: p.lat,
        lng: p.lng,
      }
    }
    case 'stay': {
      const nights = item.nights > 1 ? `${item.nights} nights` : '1 night'
      const p = item.placeId ? places.get(item.placeId) : undefined
      if (p)
        return { icon: '🛏️', title: p.name, subtitle: nights, markerKey: 'place:' + p.id, lat: p.lat, lng: p.lng }
      const person = item.personId ? people.get(item.personId) : undefined
      if (person)
        return {
          icon: '🛏️',
          title: `Stay with ${person.name || 'Unnamed'}`,
          subtitle: [nights, person.city].filter(Boolean).join(' · '),
          markerKey: person.lat != null ? 'person:' + person.id : null,
          lat: person.lat,
          lng: person.lng,
        }
      return { icon: '🛏️', title: item.title || 'Accommodation', subtitle: nights, ...none }
    }
    case 'train': {
      const t = item.train
      const sub = [t?.arrive ? `arr. ${t.arrive}` : '', t?.number, t?.reservation ? '⚠️ reservation' : '']
      return {
        icon: '🚆',
        title: `${t?.from || '?'} → ${t?.to || '?'}`,
        subtitle: sub.filter(Boolean).join(' · '),
        ...none,
      }
    }
    default:
      return { icon: '📝', title: item.title || 'Note', subtitle: item.notes, ...none }
  }
}

export function trainLeg(item: TimelineItem): [[number, number], [number, number]] | null {
  const t = item.train
  if (!t || t.fromLat == null || t.fromLng == null || t.toLat == null || t.toLng == null) return null
  return [
    [t.fromLng, t.fromLat],
    [t.toLng, t.toLat],
  ]
}

/**
 * Order value for an item whose time was just set: right before the first other
 * item of the day with a later time, or after the last one with an earlier time.
 */
export function orderForTime(dayItems: TimelineItem[], item: TimelineItem): number {
  const others = dayItems.filter((i) => i.id !== item.id).sort((a, b) => a.order - b.order)
  if (!item.time) return item.order
  const nextIdx = others.findIndex((i) => i.time && i.time > item.time)
  if (nextIdx >= 0) return between(others[nextIdx - 1]?.order, others[nextIdx].order)
  const timed = others.filter((i) => i.time)
  if (timed.length === 0) return item.order
  const last = timed[timed.length - 1]
  return between(last.order, others[others.indexOf(last) + 1]?.order)
}

export function between(prev: number | undefined, next: number | undefined) {
  if (prev != null && next != null) return (prev + next) / 2
  if (prev != null) return prev + 1
  if (next != null) return next - 1
  return 1
}

export type TimelineRow =
  | { kind: 'day'; date: string; dayNumber: number; items: TimelineItem[]; continuingStay: { item: TimelineItem; night: number } | null }
  | { kind: 'gap'; from: string; count: number; stay: TimelineItem | null }

/** The stay item whose nights include `date` (if any) */
function stayOn(date: string, stays: TimelineItem[]) {
  return stays.find((s) => s.date && daysBetween(s.date, date) >= 0 && daysBetween(s.date, date) < s.nights)
}

/** Days that have a header or entries, with collapsed gaps between them */
export function buildRows(items: TimelineItem[], days: Record<string, DayInfo>): TimelineRow[] {
  const dates = new Set(Object.keys(days))
  for (const i of items) if (i.date) dates.add(i.date)
  const sorted = [...dates].sort()
  if (sorted.length === 0) return []

  const stays = items.filter((i) => i.type === 'stay' && i.date)
  const rows: TimelineRow[] = []
  sorted.forEach((date, idx) => {
    if (idx > 0) {
      const gap = daysBetween(sorted[idx - 1], date) - 1
      if (gap > 0) {
        const from = addDays(sorted[idx - 1], 1)
        rows.push({ kind: 'gap', from, count: gap, stay: stayOn(from, stays) ?? null })
      }
    }
    const stay = stayOn(date, stays)
    rows.push({
      kind: 'day',
      date,
      dayNumber: daysBetween(sorted[0], date) + 1,
      items: items.filter((i) => i.date === date),
      continuingStay: stay && stay.date !== date ? { item: stay, night: daysBetween(stay.date!, date) + 1 } : null,
    })
  })
  return rows
}

export function newItem(type: ItemType, date: string | null, patch: Partial<TimelineItem> = {}): TimelineItem {
  const now = Date.now()
  return {
    id: newId(),
    type,
    date,
    order: nextOrder(date),
    time: '',
    title: '',
    notes: '',
    placeId: null,
    personId: null,
    nights: 1,
    train:
      type === 'train'
        ? { from: '', to: '', fromLat: null, fromLng: null, toLat: null, toLng: null, arrive: '', number: '', reservation: false }
        : null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  }
}
