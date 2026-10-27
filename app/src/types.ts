export type PlaceCategory =
  | 'sight'
  | 'city'
  | 'food'
  | 'stay'
  | 'station'
  | 'nature'
  | 'nightlife'
  | 'shop'
  | 'other'

export type PlaceStatus = 'idea' | 'planned' | 'visited'

export interface Place {
  id: string
  name: string
  lat: number
  lng: number
  category: PlaceCategory
  status: PlaceStatus
  notes: string
  url: string
  /** Manual list order (older entries without one fall back to createdAt) */
  order?: number
  groupId?: string | null
  createdAt: number
  updatedAt: number
}

export interface Person {
  id: string
  name: string
  city: string
  address: string
  /** How exactly the pin is placed: just the city, or the real address */
  precision: 'city' | 'address'
  lat: number | null
  lng: number | null
  contact: string
  notes: string
  canStay: boolean
  order?: number
  groupId?: string | null
  createdAt: number
  updatedAt: number
}

export interface Group {
  id: string
  kind: 'place' | 'person'
  name: string
  color: string
  createdAt: number
}

/** Stands for "items without a group" in filters and map toggles */
export const NO_GROUP = '__none'

/** One end of a travel line: a pin (followed when it moves) or a fixed point with a name */
export interface Endpoint {
  placeId?: string | null
  personId?: string | null
  name: string
  lat: number
  lng: number
}

/** "train" = a concrete train connection, "plan" = a general idea of where to go next */
export type LineKind = 'train' | 'plan'

/** One train (or ferry) of a train connection */
export interface RouteLeg {
  from: string
  to: string
  /** Operator, e.g. "Österreichische Bundesbahnen" */
  agency: string
  mode: string
  /** Train name / number, e.g. "RJX 63" */
  name?: string
  /** ISO times on a typical weekday (the route was looked up for one) */
  departure?: string
  arrival?: string
  /** Stops in between */
  stops?: string[]
  /** The data says a seat reservation is required */
  reservation?: boolean
}

export interface TravelLine {
  id: string
  kind: LineKind
  from: Endpoint
  to: Endpoint
  notes: string
  order?: number
  /** Train connections: the route along the tracks, for the ends it was looked up for */
  route?: {
    key: string
    /** [lng, lat] points; null = no train route found */
    path: [number, number][] | null
    legs: RouteLeg[]
  } | null
  createdAt: number
  updatedAt: number
}

export type ExpenseCategory = 'food' | 'stay' | 'transport' | 'sights' | 'groceries' | 'nightlife' | 'shopping' | 'other'

export interface Expense {
  id: string
  /** YYYY-MM-DD */
  date: string
  amount: number
  /** ISO 4217, e.g. EUR, CZK */
  currency: string
  /** 1 EUR = rate × currency at the time of entry; null if unknown then (offline) */
  rate: number | null
  /** Optional tag; null = no category */
  category: ExpenseCategory | null
  note: string
  /** Big one-off cost (pass, prepaid hostel…): kept out of the daily budget */
  oneOff: boolean
  createdAt: number
  updatedAt: number
}

export type InterrailMode = 'highlight' | 'dim' | 'off'

export interface Settings {
  interrailMode: InterrailMode
  /** ISO 3166-1 alpha-2 codes counted as Interrail countries */
  interrailCountries: string[]
  showPlaces: boolean
  showPeople: boolean
  showPlaceLabels: boolean
  showPeopleLabels: boolean
  /** Group ids (or NO_GROUP-prefixed kind) hidden on the map */
  hiddenGroups: string[]
  showCurrencies: boolean
  showTravelLines: boolean
  showFerriesIncluded: boolean
  showFerriesDiscount: boolean
  /** Trains tab: fade everything else while direct-train results are shown */
  reachFocus: boolean
  /** Clean map: only pins + names, country names and travel lines */
  simpleView: boolean
  /** Daily spending goal in EUR */
  budgetDaily: number
  /** First day of the budget (YYYY-MM-DD); null = first timeline day */
  budgetStart: string | null
  /** Basemap text: everything, only country names, or nothing */
  mapLabels: 'all' | 'countries' | 'none'
  /** OpenRailwayMap overlay */
  showRailways: boolean
  /** Railway line types (see RAIL_TYPES) hidden on the map */
  hiddenRailTypes: string[]
  showStations: boolean
  /** Basemap roads, road names and shields */
  showStreets: boolean
  colorPlacesByGroup: boolean
  colorPeopleByGroup: boolean
}

export type Selection = { kind: 'place' | 'person'; id: string } | null

export type ItemType = 'place' | 'train' | 'stay' | 'note'

export interface TrainInfo {
  from: string
  to: string
  fromLat: number | null
  fromLng: number | null
  toLat: number | null
  toLng: number | null
  /** Arrival time HH:MM; departure is the item's `time` */
  arrive: string
  /** Train number / name, e.g. "RJX 63" */
  number: string
  reservation: boolean
}

export interface TimelineItem {
  id: string
  type: ItemType
  /** YYYY-MM-DD, or null for the "unscheduled" list */
  date: string | null
  /** Manual order within the day (fractional, so items can be inserted between others) */
  order: number
  /** Optional HH:MM */
  time: string
  /** Free title for notes and stays without a place/person */
  title: string
  notes: string
  placeId: string | null
  personId: string | null
  /** Stays only: number of nights starting at `date` */
  nights: number
  train: TrainInfo | null
  createdAt: number
  updatedAt: number
}

export interface DayInfo {
  date: string
  title: string
}
