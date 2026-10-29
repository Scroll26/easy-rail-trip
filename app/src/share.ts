import { AUTH_URL } from './config'
import { doc, getShare, replaceTrip, tripData, updateSettings, type TripData } from './store'
import { session } from './sync/googleAuth'
import type { RouteLeg, TravelLine } from './types'

// Read-only sharing of the trip. Both kinds of link open this app as a viewer:
// - live link (#share=<id>): the sign-in helper keeps a copy (Workers KV), updated a few
//   seconds after each change, so the link always shows the current plan. Can be switched off.
// - snapshot link (#trip=<data>): the whole trip packed into the link itself. No server,
//   but it never changes and can't be switched off.
// Shared: stops, connections, things to do, and the map settings. Left out: prices and the
// budget, places that aren't part of the trip, and people's addresses and contact details.

export interface SharedTrip extends Omit<TripData, 'expenses'> {
  app: 'rail-planner-share'
  /** When this copy was made (ms) */
  sharedAt: number
}

const SHARE_HASH = /^#(share|trip)=(.+)$/
const CACHE_PREFIX = 'rail-planner:shared:'
const PUSHED_KEY = 'rail-planner:share-pushed'
const PUSH_DELAY = 10_000

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

/** The trip as others get to see it */
export function sharedTrip(): SharedTrip {
  const d = tripData()
  const places = new Set<string>()
  const people = new Set<string>()
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
  const settings = { ...d.settings }
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

// ---- Links ----

const appUrl = () => location.origin + import.meta.env.BASE_URL

export const liveLink = (id: string) => `${appUrl()}#share=${id}`

export async function snapshotLink() {
  return `${appUrl()}#trip=${toBase64Url(await deflate(JSON.stringify(sharedTrip())))}`
}

async function deflate(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array) {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

function toBase64Url(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

// ---- Viewer ----

export interface LoadedShare {
  trip: SharedTrip
  /** A live link (it can change), not a snapshot */
  live: boolean
  /** Couldn't reach the helper: this is the copy from the last visit */
  offline: boolean
}

function check(t: unknown): SharedTrip {
  if ((t as SharedTrip)?.app !== 'rail-planner-share') throw new Error("This link doesn't contain a trip.")
  return t as SharedTrip
}

/** The shared trip of the link this page was opened with */
export async function loadShareFromUrl(): Promise<LoadedShare> {
  const m = location.hash.match(SHARE_HASH)
  if (!m) throw new Error('No shared trip in this link.')
  if (m[1] === 'trip') {
    try {
      return { trip: check(JSON.parse(await inflate(fromBase64Url(m[2])))), live: false, offline: false }
    } catch {
      throw new Error('This link is broken or incomplete. Ask for it again (it may have been cut off when it was sent).')
    }
  }
  const id = m[2]
  try {
    return { trip: await fetchLive(id), live: true, offline: false }
  } catch (e) {
    if ((e as Error).name !== 'TypeError') throw e
    // Offline: the copy from last time
    const cached = readCache(id)
    if (cached) return { trip: cached, live: true, offline: true }
    throw new Error('Opening a shared trip needs an internet connection the first time.')
  }
}

async function fetchLive(id: string) {
  const res = await fetch(`${AUTH_URL}/share/${encodeURIComponent(id)}`)
  if (res.status === 404) throw new Error('This trip is no longer shared (the link was switched off).')
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

/** Newer copy of the live trip being viewed, or null if it hasn't changed (or can't be reached) */
export async function refreshLive(since: number): Promise<SharedTrip | null> {
  const m = location.hash.match(SHARE_HASH)
  if (m?.[1] !== 'share' || !navigator.onLine) return null
  try {
    const trip = await fetchLive(m[2])
    return trip.sharedAt > since ? trip : null
  } catch {
    return null
  }
}

export function showShared(trip: SharedTrip) {
  replaceTrip({ ...trip, expenses: [] })
}

// ---- Your live link ----

async function helper(method: string, path: string, body: unknown) {
  const res = await fetch(AUTH_URL + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const reply = await res.json().catch(() => ({}))
  return { status: res.status, body: reply as { id?: string; key?: string; error?: string } }
}

export const canShareLive = () => AUTH_URL !== ''

/** Make a live link for this trip */
export async function startLiveShare() {
  const s = session()
  if (!s) throw new Error('Connect Google Drive sync first (Settings → Sync): live links are kept by the same sign-in helper.')
  const r = await helper('POST', '/share', { session: s, data: sharedTrip() })
  if (r.status === 401) throw new Error('Your Google Drive sign-in ended. Disconnect and connect sync again, then retry.')
  if (r.body.error === 'sharing_off') throw new Error("The sign-in helper isn't set up for sharing yet.")
  if (!r.body.id || !r.body.key) throw new Error("Couldn't make the link right now. Try again later.")
  updateSettings({ share: { id: r.body.id, key: r.body.key } })
}

/** Switch the live link off: it stops working for everyone */
export async function stopLiveShare() {
  const share = getShare()
  if (!share) return
  const r = await helper('DELETE', `/share/${share.id}`, { key: share.key })
  if (r.status !== 200 && r.status !== 404) throw new Error("Couldn't switch the link off right now (offline?). Try again.")
  updateSettings({ share: null })
}

/** Short fingerprint of a text, to skip uploading what's already there */
function fingerprint(text: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

let pushing = false

async function pushLiveShare() {
  const share = getShare()
  if (!share || !navigator.onLine || pushing) return
  const data = sharedTrip()
  const mark = share.id + ':' + fingerprint(JSON.stringify({ ...data, sharedAt: 0 }))
  try {
    if (localStorage.getItem(PUSHED_KEY) === mark) return
  } catch {
    /* storage unavailable: just upload */
  }
  pushing = true
  try {
    const r = await helper('PUT', `/share/${share.id}`, { key: share.key, data })
    if (r.status === 200) localStorage.setItem(PUSHED_KEY, mark)
  } catch {
    /* offline: next change or coming back online tries again */
  } finally {
    pushing = false
  }
}

/** Keep the live link up to date: upload a few seconds after changes (here or synced from another device) */
export function startSharePush() {
  if (!canShareLive()) return
  let timer: ReturnType<typeof setTimeout> | undefined
  doc.on('update', () => {
    clearTimeout(timer)
    timer = setTimeout(() => void pushLiveShare(), PUSH_DELAY)
  })
  window.addEventListener('online', () => void pushLiveShare())
  void pushLiveShare()
}
