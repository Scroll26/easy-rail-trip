import { useEffect, useState } from 'react'

// Offline country lookup from the bundled borders file (no network needed).

type Ring = [number, number][]
export interface CountryShape {
  iso: string
  name: string
  polygons: Ring[][]
  bbox: [number, number, number, number]
}

export const COUNTRIES_URL = import.meta.env.BASE_URL + 'data/countries.geojson'

let loading: Promise<CountryShape[]> | null = null

export function loadCountries() {
  loading ??= fetch(COUNTRIES_URL)
    .then((r) => r.json())
    .then((j: GeoJSON.FeatureCollection) =>
      j.features.map((f) => {
        const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
        const polygons = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][]
        const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
        for (const poly of polygons)
          for (const [x, y] of poly[0]) {
            bbox[0] = Math.min(bbox[0], x)
            bbox[1] = Math.min(bbox[1], y)
            bbox[2] = Math.max(bbox[2], x)
            bbox[3] = Math.max(bbox[3], y)
          }
        return { iso: f.properties!.iso, name: f.properties!.name, polygons, bbox }
      }),
    )
  return loading
}

function inRing(x: number, y: number, ring: Ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function countryAt(shapes: CountryShape[], lat: number, lng: number) {
  for (const c of shapes) {
    const [x0, y0, x1, y1] = c.bbox
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue
    for (const [outer, ...holes] of c.polygons)
      if (inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h))) return c
  }
  return null
}

const distKm = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => {
  const rad = Math.PI / 180
  const dx = (x2 - x1) * rad * Math.cos(((y1 + y2) / 2) * rad)
  return Math.sqrt(dx * dx + ((y2 - y1) * rad) ** 2) * 6371
}

/**
 * Countries a [lng, lat] path runs through, in order. The borders file is coarse, so a
 * country only counts after `minKm` of track inside it (except where the path starts and ends).
 */
export function countriesAlong(shapes: CountryShape[], path: [number, number][], minKm = 8): string[] {
  if (!path.length) return []
  const isoAt = ([lng, lat]: [number, number]) => countryAt(shapes, lat, lng)?.iso ?? ''
  const first = isoAt(path[0])
  const last = isoAt(path[path.length - 1])
  const km = new Map<string, number>()
  const order: string[] = []
  // Sample about every 2 km
  let prev = path[0]
  for (const p of path.slice(1)) {
    const d = distKm(prev, p)
    if (d < 2 && p !== path[path.length - 1]) continue
    const iso = isoAt([(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2])
    if (iso) {
      if (!km.has(iso)) order.push(iso)
      km.set(iso, (km.get(iso) ?? 0) + d)
    }
    prev = p
  }
  return [first, ...order, last].filter((iso, i, a) => iso && a.indexOf(iso) === i && (iso === first || iso === last || km.get(iso)! >= minKm))
}

/** Country shapes once loaded (empty array before) */
export function useCountries() {
  const [shapes, setShapes] = useState<CountryShape[]>([])
  useEffect(() => {
    loadCountries().then(setShapes)
  }, [])
  return shapes
}

/** "Germany and Poland" */
export function countryNames(isos: string[], shapes: { iso: string; name: string }[]) {
  const names = isos.map((iso) => shapes.find((c) => c.iso === iso)?.name ?? iso)
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] ?? ''
}
