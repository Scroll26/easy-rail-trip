import { useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { DEFAULT_INTERRAIL_COUNTRIES } from './data/interrail'
import type { DayInfo, Expense, Group, Person, Place, Settings, TimelineItem, TravelLine } from './types'

// The whole trip lives in one Yjs document. Each device keeps a copy in IndexedDB;
// later the same document is merged via Google Drive, so offline edits on several
// devices combine without conflicts.
export const doc = new Y.Doc()
export const persistence = new IndexeddbPersistence('rail-planner-trip', doc)

const places = doc.getMap<Place>('places')
const people = doc.getMap<Person>('people')
const settings = doc.getMap<unknown>('settings')
const timeline = doc.getMap<TimelineItem>('timeline')
const days = doc.getMap<DayInfo>('days')
const groups = doc.getMap<Group>('groups')
const lines = doc.getMap<TravelLine>('lines')
const expenses = doc.getMap<Expense>('expenses')

const DEFAULT_SETTINGS: Settings = {
  interrailMode: 'highlight',
  interrailCountries: DEFAULT_INTERRAIL_COUNTRIES,
  showPlaces: true,
  showPeople: true,
  showPlaceLabels: true,
  showPeopleLabels: true,
  hiddenGroups: [],
  showCurrencies: false,
  showTravelLines: true,
  simpleView: false,
  budgetDaily: 50,
  budgetStart: null,
  mapLabels: 'all',
  showRailways: true,
  showStreets: false,
  hiddenRailTypes: [],
  showStations: true,
  colorPlacesByGroup: true,
  colorPeopleByGroup: true,
}

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** Subscribe React to a Y.Map, re-reading it into a cached snapshot on every change. */
function createMapStore<T, S>(map: Y.Map<T>, read: (map: Y.Map<T>) => S) {
  let snapshot = read(map)
  const listeners = new Set<() => void>()
  map.observe(() => {
    snapshot = read(map)
    listeners.forEach((l) => l())
  })
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get: () => snapshot,
  }
}

export const listOrder = (x: { order?: number; createdAt: number }) => x.order ?? x.createdAt
const byListOrder = (a: Place | Person, b: Place | Person) => listOrder(a) - listOrder(b)
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

const placesStore = createMapStore(places, (m) => [...m.values()].sort(byListOrder))
const peopleStore = createMapStore(people, (m) => [...m.values()].sort(byListOrder))
const groupsStore = createMapStore(groups, (m) => [...m.values()].sort(byName))
// Newest first
const expensesStore = createMapStore(expenses, (m) =>
  [...m.values()].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
)
const linesStore = createMapStore(lines, (m) => [...m.values()].sort((a, b) => listOrder(a) - listOrder(b)))
const settingsStore = createMapStore(
  settings,
  (m) => ({ ...DEFAULT_SETTINGS, ...Object.fromEntries(m.entries()) }) as Settings,
)

const byOrder = (a: TimelineItem, b: TimelineItem) => a.order - b.order
const timelineStore = createMapStore(timeline, (m) => [...m.values()].sort(byOrder))
const daysStore = createMapStore(days, (m) => Object.fromEntries(m.entries()) as Record<string, DayInfo>)

export const usePlaces = () => useSyncExternalStore(placesStore.subscribe, placesStore.get)
export const usePeople = () => useSyncExternalStore(peopleStore.subscribe, peopleStore.get)
export const useSettings = () => useSyncExternalStore(settingsStore.subscribe, settingsStore.get)
export const useTimeline = () => useSyncExternalStore(timelineStore.subscribe, timelineStore.get)
export const useDays = () => useSyncExternalStore(daysStore.subscribe, daysStore.get)
export const useGroups = () => useSyncExternalStore(groupsStore.subscribe, groupsStore.get)
export const useLines = () => useSyncExternalStore(linesStore.subscribe, linesStore.get)
export const useExpenses = () => useSyncExternalStore(expensesStore.subscribe, expensesStore.get)

export function saveExpense(e: Expense) {
  expenses.set(e.id, { ...e, updatedAt: Date.now() })
}

export function deleteExpense(id: string) {
  expenses.delete(id)
}

export function saveLine(line: TravelLine) {
  lines.set(line.id, { ...line, updatedAt: Date.now() })
}

export function deleteLine(id: string) {
  lines.delete(id)
}

export function saveGroup(group: Group) {
  groups.set(group.id, group)
}

/** Deletes a group; its members simply become ungrouped */
export function deleteGroup(id: string) {
  doc.transact(() => {
    groups.delete(id)
    for (const map of [places, people] as Y.Map<Place | Person>[])
      for (const item of [...map.values()])
        if (item.groupId === id) map.set(item.id, { ...item, groupId: null, updatedAt: Date.now() })
    const hidden = (settings.get('hiddenGroups') as string[] | undefined) ?? []
    if (hidden.includes(id)) settings.set('hiddenGroups', hidden.filter((g) => g !== id))
  })
}

export function savePlace(place: Place) {
  places.set(place.id, { ...place, updatedAt: Date.now() })
}

/** Deletes the place and every timeline entry that points to it */
export function deletePlace(id: string) {
  doc.transact(() => {
    places.delete(id)
    for (const item of [...timeline.values()]) if (item.placeId === id) timeline.delete(item.id)
  })
}

export function savePerson(person: Person) {
  people.set(person.id, { ...person, updatedAt: Date.now() })
}

/** Deletes the person and every timeline entry that points to them */
export function deletePerson(id: string) {
  doc.transact(() => {
    people.delete(id)
    for (const item of [...timeline.values()]) if (item.personId === id) timeline.delete(item.id)
  })
}

export function saveItem(item: TimelineItem) {
  timeline.set(item.id, { ...item, updatedAt: Date.now() })
}

export function deleteItem(id: string) {
  timeline.delete(id)
}

export function getItem(id: string) {
  return timeline.get(id)
}

export function saveDay(day: DayInfo) {
  days.set(day.date, day)
}

/** Removes a day; its entries move to the unscheduled list */
export function deleteDay(date: string) {
  doc.transact(() => {
    days.delete(date)
    for (const item of [...timeline.values()])
      if (item.date === date) timeline.set(item.id, { ...item, date: null, updatedAt: Date.now() })
  })
}

/** Order value that puts a new item at the end of a day (or of the unscheduled list) */
export function nextOrder(date: string | null) {
  let max = 0
  for (const item of timeline.values()) if (item.date === date) max = Math.max(max, item.order)
  return max + 1
}

export function updateSettings(patch: Partial<Settings>) {
  doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) settings.set(k, v)
  })
}

export function getPlace(id: string) {
  return places.get(id)
}

export function getPerson(id: string) {
  return people.get(id)
}

// ---- Backup: plain JSON export / import ----

export function exportJson() {
  return JSON.stringify(
    {
      app: 'rail-planner',
      version: 1,
      exportedAt: new Date().toISOString(),
      places: [...places.values()],
      people: [...people.values()],
      timeline: [...timeline.values()],
      days: [...days.values()],
      groups: [...groups.values()],
      lines: [...lines.values()],
      expenses: [...expenses.values()],
      settings: Object.fromEntries(settings.entries()),
    },
    null,
    2,
  )
}

/** Merges a backup into the current trip; items with the same id are overwritten. */
export function importJson(text: string) {
  const data = JSON.parse(text)
  if (data.app !== 'rail-planner') throw new Error('Not a Rail Planner backup file')
  doc.transact(() => {
    for (const p of data.places ?? []) places.set(p.id, p)
    for (const p of data.people ?? []) people.set(p.id, p)
    for (const t of data.timeline ?? []) timeline.set(t.id, t)
    for (const d of data.days ?? []) days.set(d.date, d)
    for (const g of data.groups ?? []) groups.set(g.id, g)
    for (const l of data.lines ?? []) lines.set(l.id, l)
    for (const e of data.expenses ?? []) expenses.set(e.id, e)
    for (const [k, v] of Object.entries(data.settings ?? {})) settings.set(k, v)
  })
  return {
    places: data.places?.length ?? 0,
    people: data.people?.length ?? 0,
    timeline: data.timeline?.length ?? 0,
  }
}
