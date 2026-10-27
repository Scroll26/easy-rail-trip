import { useEffect, useState } from 'react'

// Offline country lookup from the bundled borders file (no network needed).

type Ring = [number, number][]
interface CountryShape {
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

/** Country shapes once loaded (empty array before) */
export function useCountries() {
  const [shapes, setShapes] = useState<CountryShape[]>([])
  useEffect(() => {
    loadCountries().then(setShapes)
  }, [])
  return shapes
}
