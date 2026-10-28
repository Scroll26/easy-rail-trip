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
  /** Position in the trip, shared with the stops */
  order?: number
  /** Departure date fixed by you (a booked train); null = the day the stop before ends */
  fixedDate?: string | null
  /** Arrives the day after it leaves (night train) */
  overnight?: boolean
  /** Planned ticket / reservation price in EUR */
  price?: number | null
  /** The expense created when it was paid */
  paidExpenseId?: string | null
  /** Countries (ISO codes) the route should stay out of; undefined = the default from Settings */
  avoid?: string[]
  /** Train connections: the route along the tracks, for the ends it was looked up for */
  route?: {
    key: string
    /** [lng, lat] points; null = no train route found */
    path: [number, number][] | null
    legs: RouteLeg[]
    /** Countries it runs through, in order */
    countries?: string[]
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

/** What stays on the map while "View trip" is on (everything else in the Map menu is paused) */
export interface TripViewOptions {
  places: boolean
  people: boolean
  pinNames: boolean
  connections: boolean
  interrail: boolean
  railways: boolean
  ferries: boolean
  streets: boolean
  currencies: boolean
  directTrains: boolean
  mapLabels: 'all' | 'countries' | 'none'
}

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
  /** "View trip": a clean map showing only what `tripView` allows */
  simpleView: boolean
  tripView: TripViewOptions
  /** First day of the trip (YYYY-MM-DD); null = the first fixed date, else today */
  tripStart: string | null
  /** Travel days of a flexi pass; null = continuous pass or not set */
  passDays: number | null
  /** Countries connections stay out of unless a connection says otherwise (e.g. your country of residence) */
  avoidCountries: string[]
  /** Daily spending goal in EUR */
  budgetDaily: number
  /** First day of the budget (YYYY-MM-DD); null = the trip start */
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

/** Where you sleep at a stop */
export interface StayInfo {
  placeId?: string | null
  personId?: string | null
  /** Name when it isn't one of your pins, e.g. "Hostel One Prague" */
  name: string
  /** Planned price for all nights, in EUR */
  price: number | null
  /** The expense created when it was paid; then it no longer counts as planned */
  paidExpenseId?: string | null
}

/** One stop of the trip: a town (or any place) where you spend some nights */
export interface Stop {
  id: string
  placeId: string
  /** 0 = just passing through */
  nights: number
  /** Arrival date fixed by you (booked night train, event…); null = follows from the stop before */
  fixedDate: string | null
  stay: StayInfo | null
  notes: string
  /** Position in the trip, shared with the connections (TravelLine.order) */
  order: number
  createdAt: number
  updatedAt: number
}

/** Something to do during a stop: one of your places, or a note */
export interface Activity {
  id: string
  stopId: string
  /** Day of the stop, 0 = arrival day; null = sometime during the stop */
  day: number | null
  placeId: string | null
  /** Text of a note (activities without a place) */
  title: string
  /** Optional HH:MM */
  time: string
  order: number
  createdAt: number
  updatedAt: number
}
