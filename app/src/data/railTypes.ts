import type maplibregl from 'maplibre-gl'

// Kinds of railway line, coloured like OpenRailwayMap's standard view
export const RAIL_TYPES = [
  { id: 'highspeed', label: 'High-speed lines', hint: 'about 200 km/h and faster', color: '#e3141b' },
  { id: 'main', label: 'Main lines', hint: 'the main network: IC/EC, long-distance and regional', color: '#ff8100' },
  { id: 'branch', label: 'Branch lines', hint: 'smaller regional lines', color: '#d9b400' },
  { id: 'narrow', label: 'Narrow gauge', hint: 'often mountain or scenic railways', color: '#a0522d' },
  { id: 'other', label: 'Other lines', hint: 'industrial, heritage or unclassified', color: '#8e8e8e' },
] as const

export type RailType = (typeof RAIL_TYPES)[number]['id']

/** Which RAIL_TYPES entry a line belongs to, from its OpenRailwayMap properties */
export const RAIL_TYPE: maplibregl.ExpressionSpecification = [
  'case',
  ['to-boolean', ['get', 'highspeed']], 'highspeed',
  ['==', ['get', 'usage'], 'main'], 'main',
  ['==', ['get', 'usage'], 'branch'], 'branch',
  ['==', ['get', 'feature'], 'narrow_gauge'], 'narrow',
  'other',
]
