// Direct train connections from Transitous (https://transitous.org), a free,
// community-run, Europe-wide timetable service built on MOTIS. Usage rules: no
// commercial use, visible attribution, few "expensive" requests, so results are
// cached on the device and every lookup is a deliberate user action.

const API = 'https://api.transitous.org/api'
const CACHE_KEY = 'rail-planner:direct-trains'
const CACHE_ENTRIES = 10
const CACHE_DAYS = 30

export const TRANSITOUS_SOURCES = 'https://transitous.org/sources/'

const RAIL_MODES = ['HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'REGIONAL_FAST_RAIL', 'REGIONAL_RAIL', 'RAIL']

export interface Station {
  name: string
  lat: number
  lng: number
  /** Transitous stop id; without it the search starts from the coordinates */
  stopId?: string
}

export interface Destination {
  name: string
  lat: number
  lng: number
  stopId: string
  /** Minutes from the chosen departure time until arrival (includes waiting for the train) */
  minutes: number
  /** ISO arrival time */
  arrival: string
  importance: number
}

export interface DirectQuery {
  /** Local departure date YYYY-MM-DD */
  date: string
  /** Local departure hour */
  hour: number
  maxHours: number
  noReservation: boolean
}

export interface DirectResult {
  origin: Station
  query: DirectQuery
  destinations: Destination[]
  fetched: number
}

interface ApiPlace {
  name: string
  stopId?: string
  lat: number
  lon: number
  arrival?: string
  importance?: number
  modes?: string[]
}

/** Stations matching a name, most important first */
export async function searchStations(text: string): Promise<Station[]> {
  const res = await fetch(`${API}/v1/geocode?${new URLSearchParams({ text, type: 'STOP' })}`)
  if (!res.ok) throw new Error(`Station search failed (${res.status})`)
  const list = (await res.json()) as { id: string; name: string; lat: number; lon: number; modes?: string[] }[]
  const rail = list.filter((s) => isRailStop(s.modes))
  return dedupeStations(rail.map((s) => ({ name: s.name, lat: s.lat, lng: s.lon, stopId: s.id })))
}

const isRailStop = (modes?: string[]) => !!modes?.some((m) => RAIL_MODES.includes(m))

const STATION_CACHE_KEY = 'rail-planner:station-near'

/**
 * The railway station for a place (e.g. a tapped city), or null if no trains run there.
 * First a station with the place's name nearby (finds "Wien Hbf" for Vienna), else any
 * rail stop within 5 km. Answers, including "none", are remembered on the device.
 */
export async function findStation(name: string, lat: number, lng: number): Promise<Station | null> {
  const key = `${name}|${lat.toFixed(3)},${lng.toFixed(3)}`
  const cache = readJson<Record<string, { s: Station | null; t: number }>>(STATION_CACHE_KEY)
  const hit = cache[key]
  if (hit && Date.now() - hit.t < CACHE_DAYS * 86400000) return hit.s

  let station: Station | null = null
  const named = (await searchStations(name)).filter((s) => distanceKm(s.lat, s.lng, lat, lng) < 25)
  if (named.length) station = named[0]
  else {
    const params = new URLSearchParams({ place: `${lat},${lng}`, type: 'STOP', numResults: '50' })
    const res = await fetch(`${API}/v1/reverse-geocode?${params}`)
    if (!res.ok) throw new Error(`Station lookup failed (${res.status})`)
    const stops = (await res.json()) as { id: string; name: string; lat: number; lon: number; modes?: string[] }[]
    const rail = stops
      .filter((s) => isRailStop(s.modes) && distanceKm(s.lat, s.lon, lat, lng) < 5)
      .sort((a, b) => distanceKm(a.lat, a.lon, lat, lng) - distanceKm(b.lat, b.lon, lat, lng))[0]
    if (rail) station = { name: rail.name, lat: rail.lat, lng: rail.lon, stopId: rail.id }
  }
  cache[key] = { s: station, t: Date.now() }
  // Keep the newest 300 answers
  const keys = Object.keys(cache).sort((a, b) => cache[b].t - cache[a].t)
  for (const k of keys.slice(300)) delete cache[k]
  try {
    localStorage.setItem(STATION_CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* storage full */
  }
  return station
}

function readJson<T>(key: string): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    return {} as T
  }
}

export async function directTrains(origin: Station, query: DirectQuery): Promise<DirectResult> {
  const key = cacheKey(origin, query)
  const cached = readCache()[key]
  if (cached && Date.now() - cached.fetched < CACHE_DAYS * 86400000) return cached

  const [y, m, d] = query.date.split('-').map(Number)
  const params = new URLSearchParams({
    // Start from the station's location, not one feed's stop id: a big station is listed
    // once per timetable feed (domestic, international...), and a short walk covers all of them
    one: `${origin.lat},${origin.lng}`,
    maxPreTransitTime: '600',
    time: new Date(y, m - 1, d, query.hour).toISOString(),
    maxTravelTime: String(query.maxHours * 60),
    maxTransfers: '0',
    transitModes: RAIL_MODES.join(','),
  })
  if (query.noReservation) params.set('noCompulsoryReservation', 'true')
  const res = await fetch(`${API}/v6/one-to-all?${params}`)
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many lookups right now. Try again in a minute.' : `Timetable lookup failed (${res.status})`)
  const j = (await res.json()) as { all: { place: ApiPlace; duration: number; k: number }[] }


  const destinations = cleanDestinations(
    j.all
      .filter((r) => r.k === 1 && r.place.stopId && (!r.place.modes || isRailStop(r.place.modes)))
      .map((r) => ({
        name: r.place.name,
        lat: r.place.lat,
        lng: r.place.lon,
        stopId: r.place.stopId!,
        minutes: r.duration,
        arrival: r.place.arrival ?? '',
        importance: r.place.importance ?? 0,
      })),
    origin,
  )
  const result: DirectResult = { origin, query, destinations, fetched: Date.now() }
  writeCache(key, result)
  return result
}

// ---------- cleaning ----------

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

/**
 * Several timetable feeds list the same station (e.g. "Decin hl.n." and "Děčín hlavní
 * nádraží"). Merge stops within 1 km, keeping the most important name and the
 * earliest arrival. Also drops the origin itself.
 */
function cleanDestinations(list: Destination[], origin: Station): Destination[] {
  // Prefer real station names over bus stations at the same spot
  const isBus = (d: Destination) => /\b(bus|zob|autobus|autobusové|avtobusna)\b/i.test(d.name)
  const byImportance = [...list].sort(
    (a, b) => Number(isBus(a)) - Number(isBus(b)) || b.importance - a.importance || a.minutes - b.minutes,
  )
  // Grid of ~2 km cells so each stop is only compared with its neighbours
  const CELL = 0.02
  const grid = new Map<string, Destination[]>()
  const cell = (lat: number, lng: number) => [Math.floor(lat / CELL), Math.floor(lng / CELL)]
  const kept: Destination[] = []
  for (const d of byImportance) {
    if (distanceKm(d.lat, d.lng, origin.lat, origin.lng) < 1.5) continue
    const [cy, cx] = cell(d.lat, d.lng)
    let twin: Destination | undefined
    for (let dy = -1; dy <= 1 && !twin; dy++)
      for (let dx = -1; dx <= 1 && !twin; dx++)
        twin = grid.get(`${cy + dy},${cx + dx}`)?.find((k) => distanceKm(k.lat, k.lng, d.lat, d.lng) < 1)
    if (twin) {
      if (d.minutes < twin.minutes) {
        twin.minutes = d.minutes
        twin.arrival = d.arrival
      }
      continue
    }
    const copy = { ...d }
    kept.push(copy)
    const k = `${cy},${cx}`
    grid.set(k, [...(grid.get(k) ?? []), copy])
  }
  return kept.sort((a, b) => a.minutes - b.minutes)
}

function dedupeStations(list: Station[]): Station[] {
  const kept: Station[] = []
  for (const s of list) if (!kept.some((k) => distanceKm(k.lat, k.lng, s.lat, s.lng) < 0.5)) kept.push(s)
  return kept
}

// ---------- cache (per device) ----------

const cacheKey = (o: Station, q: DirectQuery) =>
  [`${o.lat.toFixed(4)},${o.lng.toFixed(4)}`, q.date, q.hour, q.maxHours, q.noReservation].join('|')

function readCache(): Record<string, DirectResult> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeCache(key: string, value: DirectResult) {
  const cache = readCache()
  cache[key] = value
  // Keep only the most recent lookups
  const keys = Object.keys(cache).sort((a, b) => cache[b].fetched - cache[a].fetched)
  for (const k of keys.slice(CACHE_ENTRIES)) delete cache[k]
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* storage full: results still shown, just not cached */
  }
}

/** Lookups already on this device (newest first), for offline use */
export function cachedLookups(): DirectResult[] {
  return Object.values(readCache()).sort((a, b) => b.fetched - a.fetched)
}

/** "2 h 05" / "45 min" */
export function formatMinutes(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

export interface DirectTrainInfo {
  name: string
  agency: string
  mode: string
  departure: string
  arrival: string
  reservation: boolean
}

const directInfoCache = new Map<string, DirectTrainInfo | null>()

/** The first direct train between two stations for the chosen day/time: name, operator, reservation */
export async function directTrainInfo(origin: Station, dest: Destination, query: DirectQuery): Promise<DirectTrainInfo | null> {
  const key = [origin.lat.toFixed(4), origin.lng.toFixed(4), dest.stopId, query.date, query.hour, query.noReservation].join('|')
  if (directInfoCache.has(key)) return directInfoCache.get(key)!
  const [y, m, d] = query.date.split('-').map(Number)
  const params = new URLSearchParams({
    fromPlace: `${origin.lat},${origin.lng}`,
    toPlace: dest.stopId,
    time: new Date(y, m - 1, d, query.hour).toISOString(),
    maxTransfers: '0',
    transitModes: RAIL_MODES.join(','),
    numItineraries: '1',
    maxPreTransitTime: '600',
    detailedTransfers: 'false',
  })
  if (query.noReservation) params.set('noCompulsoryReservation', 'true')
  const res = await fetch(`${API}/v6/plan?${params}`)
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
  const j = (await res.json()) as {
    itineraries?: { legs: { mode: string; agencyName?: string; displayName?: string; routeShortName?: string; startTime: string; endTime: string; reservation?: string }[] }[]
  }
  const leg = j.itineraries?.[0]?.legs.find((l) => l.mode !== 'WALK')
  const info = leg
    ? {
        name: leg.displayName || leg.routeShortName || '',
        agency: leg.agencyName ?? '',
        mode: leg.mode,
        departure: leg.startTime,
        arrival: leg.endTime,
        reservation: leg.reservation === 'COMPULSORY',
      }
    : null
  directInfoCache.set(key, info)
  return info
}
