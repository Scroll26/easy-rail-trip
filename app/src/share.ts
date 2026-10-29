import { AUTH_URL } from './config'
import { getShare, replaceTrip, tripData, updateSettings, type TripData } from './store'
import { session } from './sync/googleAuth'
import { NO_GROUP, type RouteLeg, type TravelLine } from './types'

// Read-only sharing of the trip as a snapshot: a copy of the trip as it looks with "View trip"
// on, kept by the sign-in helper (Workers KV) under a short link (#share=<id>). Updating the
// snapshot keeps the link; the helper deletes it a year after its last update, or when you do.
// Shared: the stops, connections and things to do, plus the pins View trip shows. Left out:
// prices and the budget, and people's addresses and contact details.

export interface SharedTrip extends Omit<TripData, 'expenses'> {
  app: 'rail-planner-share'
  /** When this copy was made (ms) */
  sharedAt: number
}

const SHARE_HASH = /^#share=(.+)$/
const CACHE_PREFIX = 'rail-planner:shared:'

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits
// ~10 m: plenty for drawing, and much shorter
const pt = (p: [number, number]): [number, number] => [round(p[0], 4), round(p[1], 4)]
const pts = (path?: [number, number][] | null) => path && path.map(pt)

function shareLine(l: TravelLine): TravelLine {
  const leg = (g: RouteLeg): RouteLeg => ({
    ...g,
    path: pts(g.path) ?? undefined,
    fromAt: g.fromAt && pt(g.fromAt),
    toAt: g.toAt && pt(g.toAt),
    stopsAt: pts(g.stopsAt) ?? undefined,
  })
  return {
    ...l,
    price: null,
    paidExpenseId: null,
    route: l.route && { ...l.route, path: pts(l.route.path) ?? null, legs: l.route.legs.map(leg) },
  }
}

/** The trip as others get to see it: what the map shows with "View trip" on */
export function sharedTrip(): SharedTrip {
  const d = tripData()
  const view = { ...d.settings.tripView }
  const hidden = new Set(d.settings.hiddenGroups ?? [])
  const pinShown = (kind: 'place' | 'person', groupId?: string | null) =>
    (kind === 'place' ? view.places ?? true : view.people ?? true) && !hidden.has(groupId ?? `${NO_GROUP}:${kind}`)

  // The trip needs its own places and people even when their pins are hidden
  const places = new Set(d.places.filter((p) => pinShown('place', p.groupId)).map((p) => p.id))
  const people = new Set(d.people.filter((p) => pinShown('person', p.groupId)).map((p) => p.id))
  // People a connection starts or ends at keep their exact spot (the stored route depends on it)
  const exact = new Set<string>()
  for (const s of d.stops) {
    places.add(s.placeId)
    if (s.stay?.placeId) places.add(s.stay.placeId)
    if (s.stay?.personId) people.add(s.stay.personId)
  }
  for (const a of d.activities) if (a.placeId) places.add(a.placeId)
  for (const l of d.lines)
    for (const e of [l.from, l.to]) {
      if (e.placeId) places.add(e.placeId)
      if (e.personId) {
        people.add(e.personId)
        exact.add(e.personId)
      }
    }
  const sharedPlaces = d.places.filter((p) => places.has(p.id))
  const sharedPeople = d.people
    .filter((p) => people.has(p.id))
    .map((p) => ({
      ...p,
      address: '',
      contact: '',
      notes: '',
      // Roughly where they live (about 1 km)
      lat: p.lat == null || exact.has(p.id) ? p.lat : round(p.lat, 2),
      lng: p.lng == null || exact.has(p.id) ? p.lng : round(p.lng, 2),
    }))
  const groups = new Set([...sharedPlaces, ...sharedPeople].map((x) => x.groupId))
  // Always shown as with "View trip" on
  const settings = { ...d.settings, simpleView: true }
  delete settings.share
  delete settings.budgetDaily
  delete settings.budgetStart
  return {
    app: 'rail-planner-share',
    sharedAt: Date.now(),
    places: sharedPlaces,
    people: sharedPeople,
    stops: d.stops.map((s) => ({ ...s, stay: s.stay && { ...s.stay, price: null, paidExpenseId: null } })),
    activities: d.activities,
    groups: d.groups.filter((g) => groups.has(g.id)),
    lines: d.lines.map(shareLine),
    settings,
  }
}

export const shareLink = (id: string) => `${location.origin}${import.meta.env.BASE_URL}#share=${id}`

// ---- Viewer ----

export interface LoadedShare {
  trip: SharedTrip
  /** Couldn't reach the helper: this is the copy from the last visit */
  offline: boolean
}

function check(t: unknown): SharedTrip {
  if ((t as SharedTrip)?.app !== 'rail-planner-share') throw new Error("This link doesn't contain a trip.")
  return t as SharedTrip
}

const linkId = () => location.hash.match(SHARE_HASH)?.[1] ?? null

/** The shared trip of the link this page was opened with */
export async function loadShareFromUrl(): Promise<LoadedShare> {
  const id = linkId()
  if (!id) throw new Error('No shared trip in this link.')
  try {
    return { trip: await fetchShared(id), offline: false }
  } catch (e) {
    if ((e as Error).name !== 'TypeError') throw e
    // Offline: the copy from last time
    const cached = readCache(id)
    if (cached) return { trip: cached, offline: true }
    throw new Error('Opening a shared trip needs an internet connection the first time.')
  }
}

async function fetchShared(id: string) {
  const res = await fetch(`${AUTH_URL}/share/${encodeURIComponent(id)}`)
  if (res.status === 404) throw new Error('This trip is no longer shared (the link was deleted or is over a year old).')
  if (!res.ok) throw new Error('The shared trip could not be loaded right now. Try again later.')
  const trip = check(await res.json())
  try {
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(trip))
  } catch {
    /* storage full or unavailable: works online only */
  }
  return trip
}

function readCache(id: string) {
  try {
    return check(JSON.parse(localStorage.getItem(CACHE_PREFIX + id) ?? 'null'))
  } catch {
    return null
  }
}

/** A newer snapshot behind the link being viewed, or null if it hasn't changed (or can't be reached) */
export async function refreshShared(since: number): Promise<SharedTrip | null> {
  const id = linkId()
  if (!id || !navigator.onLine) return null
  try {
    const trip = await fetchShared(id)
    return trip.sharedAt > since ? trip : null
  } catch {
    return null
  }
}

export function showShared(trip: SharedTrip) {
  replaceTrip({ ...trip, expenses: [] })
}

// ---- Your shared link ----

async function helper(method: string, path: string, body: unknown) {
  const res = await fetch(AUTH_URL + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const reply = await res.json().catch(() => ({}))
  return { status: res.status, body: reply as { id?: string; key?: string; error?: string } }
}

export const canShare = () => AUTH_URL !== ''

/** Share the trip as it is now. Your link stays the same: it then shows this snapshot. */
export async function saveSnapshot() {
  if (!navigator.onLine) throw new Error('Sharing needs an internet connection.')
  const data = sharedTrip()
  const share = getShare()
  if (share) {
    const r = await helper('PUT', `/share/${share.id}`, { key: share.key, data })
    if (r.status === 200) {
      updateSettings({ share: { ...share, at: data.sharedAt } })
      return
    }
    // Gone (deleted elsewhere or expired): make a new link below
    if (r.status !== 404) throw new Error("Couldn't update the link right now. Try again later.")
  }
  const s = session()
  if (!s) throw new Error('Connect Google Drive sync first (Settings → Sync): links are kept by the same sign-in helper.')
  const r = await helper('POST', '/share', { session: s, data })
  if (r.status === 401) throw new Error('Your Google Drive sign-in ended. Disconnect and connect sync again, then retry.')
  if (r.body.error === 'sharing_off') throw new Error("The sign-in helper isn't set up for sharing yet.")
  if (!r.body.id || !r.body.key) throw new Error("Couldn't make the link right now. Try again later.")
  updateSettings({ share: { id: r.body.id, key: r.body.key, at: data.sharedAt } })
}

/** Delete your shared link and its copy of the trip: it stops working for everyone */
export async function deleteSnapshot() {
  const share = getShare()
  if (!share) return
  if (!navigator.onLine) throw new Error('Deleting the link needs an internet connection.')
  const r = await helper('DELETE', `/share/${share.id}`, { key: share.key })
  if (r.status !== 200 && r.status !== 404) throw new Error("Couldn't delete the link right now. Try again later.")
  updateSettings({ share: null })
}
