// Free OpenStreetMap geocoder. Usage policy: max 1 request/second and no
// search-as-you-type, so we only call it on explicit user actions.
const BASE = 'https://nominatim.openstreetmap.org'

export interface GeoResult {
  name: string
  label: string
  lat: number
  lng: number
  type: string
}

interface NominatimItem {
  lat: string
  lon: string
  name?: string
  display_name: string
  type: string
  addresstype?: string
}

// Without a proper name, use the first part of the address that isn't a house number
const fallbackName = (label: string) =>
  label.split(',').map((s) => s.trim()).find((s) => !/^\d/.test(s)) ?? label

const toResult = (r: NominatimItem): GeoResult => ({
  name: r.name || fallbackName(r.display_name),
  label: r.display_name,
  lat: parseFloat(r.lat),
  lng: parseFloat(r.lon),
  type: r.addresstype || r.type,
})

export async function search(query: string): Promise<GeoResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '6',
    'accept-language': 'en',
  })
  const res = await fetch(`${BASE}/search?${params}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  return ((await res.json()) as NominatimItem[]).map(toResult)
}

export async function reverse(lat: number, lng: number): Promise<GeoResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    zoom: '18',
    'accept-language': 'en',
  })
  const res = await fetch(`${BASE}/reverse?${params}`)
  if (!res.ok) return null
  const r = await res.json()
  return r?.lat ? toResult(r) : null
}
