import type { PlaceCategory, PlaceStatus } from '../types'

export const CATEGORIES: Record<PlaceCategory, { label: string; icon: string }> = {
  sight: { label: 'Sight', icon: '🏛️' },
  city: { label: 'City', icon: '🏙️' },
  food: { label: 'Food & drink', icon: '🍽️' },
  stay: { label: 'Accommodation', icon: '🛏️' },
  station: { label: 'Station', icon: '🚉' },
  nature: { label: 'Nature', icon: '🌲' },
  nightlife: { label: 'Nightlife', icon: '🍻' },
  shop: { label: 'Shopping', icon: '🛍️' },
  other: { label: 'Other', icon: '📍' },
}

export const STATUSES: Record<PlaceStatus, { label: string; color: string }> = {
  idea: { label: 'Idea', color: '#64748b' },
  planned: { label: 'Planned', color: '#0f766e' },
  visited: { label: 'Visited', color: '#b45309' },
}

/** Colours new groups get, in turn */
export const GROUP_COLORS = [
  '#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2',
  '#ca8a04', '#dc2626', '#0f766e', '#9333ea', '#65a30d', '#475569',
]
