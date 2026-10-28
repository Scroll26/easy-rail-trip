import { useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { DEFAULT_INTERRAIL_COUNTRIES } from './data/interrail'
import type { Activity, Expense, Group, Person, Place, Settings, Stop, TravelLine, TripViewOptions } from './types'

// The whole trip lives in one Yjs document. Each device keeps a copy in IndexedDB;
// later the same document is merged via Google Drive, so offline edits on several
// devices combine without conflicts.
export const doc = new Y.Doc()
export const persistence = new IndexeddbPersistence('rail-planner-trip', doc)

const places = doc.getMap<Place>('places')
const people = doc.getMap<Person>('people')
const settings = doc.getMap<unknown>('settings')
const stops = doc.getMap<Stop>('stops')
const activities = doc.getMap<Activity>('activities')
const groups = doc.getMap<Group>('groups')
const lines = doc.getMap<TravelLine>('lines')
const expenses = doc.getMap<Expense>('expenses')

// The old day-by-day timeline was replaced by stops + activities; drop its leftovers
void persistence.whenSynced.then(() =>
  doc.transact(() => {
    for (const name of ['timeline', 'days']) doc.getMap(name).clear()
  }),
)

/** View trip by default: pins with names, your connections and country names only */
export const DEFAULT_TRIP_VIEW: TripViewOptions = {
  pinNames: true,
  connections: true,
  interrail: false,
  railways: false,
  ferries: false,
  streets: false,
  currencies: false,
  directTrains: false,
  mapLabels: 'countries',
}

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
  showFerriesIncluded: true,
  showFerriesDiscount: true,
  reachFocus: true,
  simpleView: false,
  tripView: DEFAULT_TRIP_VIEW,
  tripStart: null,
  passDays: null,
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
  (m) => {
    const s = { ...DEFAULT_SETTINGS, ...Object.fromEntries(m.entries()) } as Settings
    // Options added later get their defaults
    return { ...s, tripView: { ...DEFAULT_TRIP_VIEW, ...s.tripView } }
  },
)

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order
const stopsStore = createMapStore(stops, (m) => [...m.values()].sort(byOrder))
const activitiesStore = createMapStore(activities, (m) => [...m.values()].sort(byOrder))

export const usePlaces = () => useSyncExternalStore(placesStore.subscribe, placesStore.get)
export const usePeople = () => useSyncExternalStore(peopleStore.subscribe, peopleStore.get)
export const useSettings = () => useSyncExternalStore(settingsStore.subscribe, settingsStore.get)
export const useStops = () => useSyncExternalStore(stopsStore.subscribe, stopsStore.get)
export const useActivities = () => useSyncExternalStore(activitiesStore.subscribe, activitiesStore.get)
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

export function getLine(id: string) {
  return lines.get(id)
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

/** Deletes the place, its stops and activities; stays there keep its name */
export function deletePlace(id: string) {
  doc.transact(() => {
    const name = places.get(id)?.name ?? ''
    places.delete(id)
    for (const stop of [...stops.values()]) {
      if (stop.placeId === id) deleteStop(stop.id)
      else if (stop.stay?.placeId === id)
        stops.set(stop.id, { ...stop, stay: { ...stop.stay, placeId: null, name: stop.stay.name || name }, updatedAt: Date.now() })
    }
    for (const a of [...activities.values()]) if (a.placeId === id) activities.delete(a.id)
  })
}

export function savePerson(person: Person) {
  people.set(person.id, { ...person, updatedAt: Date.now() })
}

/** Deletes the person; stays with them keep the name */
export function deletePerson(id: string) {
  doc.transact(() => {
    const name = people.get(id)?.name ?? ''
    people.delete(id)
    for (const stop of [...stops.values()])
      if (stop.stay?.personId === id)
        stops.set(stop.id, { ...stop, stay: { ...stop.stay, personId: null, name: stop.stay.name || name }, updatedAt: Date.now() })
  })
}

export function saveStop(stop: Stop) {
  stops.set(stop.id, { ...stop, updatedAt: Date.now() })
}

export function getStop(id: string) {
  return stops.get(id)
}

/** Deletes a stop with its activities (connections stay) */
export function deleteStop(id: string) {
  doc.transact(() => {
    stops.delete(id)
    for (const a of [...activities.values()]) if (a.stopId === id) activities.delete(a.id)
  })
}

export function saveActivity(a: Activity) {
  activities.set(a.id, { ...a, updatedAt: Date.now() })
}

export function deleteActivity(id: string) {
  activities.delete(id)
}

/** Order value that puts a new stop or connection at the end of the trip */
export function nextTripOrder() {
  let max = 0
  for (const s of stops.values()) max = Math.max(max, s.order)
  for (const l of lines.values()) max = Math.max(max, listOrder(l))
  return max + 1
}

/** Order value that puts a new activity at the end of its stop */
export function nextActivityOrder(stopId: string) {
  let max = 0
  for (const a of activities.values()) if (a.stopId === stopId) max = Math.max(max, a.order)
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
      version: 2,
      exportedAt: new Date().toISOString(),
      places: [...places.values()],
      people: [...people.values()],
      stops: [...stops.values()],
      activities: [...activities.values()],
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
    for (const t of data.stops ?? []) stops.set(t.id, t)
    for (const a of data.activities ?? []) activities.set(a.id, a)
    for (const g of data.groups ?? []) groups.set(g.id, g)
    for (const l of data.lines ?? []) lines.set(l.id, l)
    for (const e of data.expenses ?? []) expenses.set(e.id, e)
    for (const [k, v] of Object.entries(data.settings ?? {})) settings.set(k, v)
  })
  return {
    places: data.places?.length ?? 0,
    people: data.people?.length ?? 0,
    stops: data.stops?.length ?? 0,
  }
}
