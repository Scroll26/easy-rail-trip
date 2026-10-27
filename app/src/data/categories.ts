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
