import maplibregl from 'maplibre-gl'

export const isPhone = () => window.matchMedia('(max-width: 799px)').matches

/** Fit the map to a path, keeping it clear of the half-open list on the phone */
export function fitPath(map: maplibregl.Map | null, path: [number, number][], maxZoom: number) {
  if (!map || !path.length) return
  const padding = isPhone() ? { top: 70, left: 40, right: 40, bottom: window.innerHeight * 0.5 + 30 } : 80
  map.fitBounds(path.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(path[0], path[0])), { padding, maxZoom })
}
