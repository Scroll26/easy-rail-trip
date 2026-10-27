// Ferries with an Interrail benefit (interrail.com "Ferries", checked October 2026).
// Only Superfast Italy–Greece is included in the Global Pass; the others give a
// discount. Paths are [lat, lng] waypoints that keep the line at sea.

export interface FerryRoute {
  operator: string
  name: string
  included: boolean
  benefit: string
  path: [number, number][]
}

const P = {
  ancona: [43.62, 13.51], bari: [41.14, 16.87], brindisi: [40.64, 17.95], igoumenitsa: [39.5, 20.26], patras: [38.25, 21.73],
  piraeus: [37.94, 23.63], heraklion: [35.34, 25.14], paros: [37.08, 25.15], naxos: [37.1, 25.38], santorini: [36.42, 25.43],
  kos: [36.89, 27.29], rhodes: [36.45, 28.23], civitavecchia: [42.09, 11.79], barcelona: [41.35, 2.17], split: [43.5, 16.44],
  hook: [51.98, 4.13], harwich: [51.95, 1.29], dublin: [53.35, -6.2], holyhead: [53.31, -4.63], rosslare: [52.25, -6.34],
  fishguard: [52.01, -4.98], pembroke: [51.68, -4.93], cherbourg: [49.65, -1.62], belfast: [54.62, -5.89],
  cairnryan: [54.97, -5.02], birkenhead: [53.39, -3.01], kiel: [54.32, 10.14], gothenburg: [57.69, 11.95],
  frederikshavn: [57.44, 10.55], rostock: [54.17, 12.1], trelleborg: [55.37, 13.15], gdynia: [54.53, 18.56],
  karlskrona: [56.16, 15.59], travemunde: [53.96, 10.87], liepaja: [56.53, 21.0], nynashamn: [58.9, 17.95],
  ventspils: [57.4, 21.55], gdansk: [54.4, 18.68], swinoujscie: [53.91, 14.25], ystad: [55.42, 13.82],
  hirtshals: [57.59, 9.96], kristiansand: [58.14, 8.0], stavanger: [58.97, 5.73], bergen: [60.39, 5.32],
  helsinki: [60.16, 24.95], tallinn: [59.44, 24.77], stockholm: [59.35, 18.1], mariehamn: [60.09, 19.94],
  turku: [60.43, 22.22], riga: [56.96, 24.1],
} satisfies Record<string, [number, number]>

type LL = [number, number]
// Down the Adriatic, past the Albanian coast and through the Corfu strait (stays at sea)
const ADRIATIC_N: LL[] = [[42.6, 15.3], [41.6, 17.2], [40.7, 18.85]]
const TO_IGOUMENITSA: LL[] = [[40.1, 19.45], [39.75, 20.0]]
const TO_PATRAS: LL[] = [[39.15, 20.15], [38.55, 20.45], [38.3, 21.2]]

const SUPERFAST =
  'Included in the Interrail Global Pass: no passenger fare (deck), but it uses a travel day. Port taxes, high-season surcharges and cabins cost extra; book with the operator.'
const discount = (pct: string) => `${pct} with your Interrail Pass; book directly with the operator.`

export const FERRIES: FerryRoute[] = [
  { operator: 'Superfast Ferries', name: 'Ancona – Igoumenitsa – Patras', included: true, benefit: SUPERFAST,
    path: [P.ancona, ...ADRIATIC_N, ...TO_IGOUMENITSA, P.igoumenitsa, ...TO_PATRAS, P.patras] },
  { operator: 'Superfast Ferries', name: 'Bari – Igoumenitsa – Patras', included: true, benefit: SUPERFAST,
    path: [P.bari, [41.15, 17.6], [40.7, 18.85], ...TO_IGOUMENITSA, P.igoumenitsa, ...TO_PATRAS, P.patras] },
  { operator: 'Minoan Lines', name: 'Ancona – Igoumenitsa – Patras', included: false, benefit: discount('Discount'),
    path: [P.ancona, [42.65, 15.4], [41.65, 17.3], [40.75, 18.95], ...TO_IGOUMENITSA, P.igoumenitsa, ...TO_PATRAS, P.patras] },
  { operator: 'Minoan Lines', name: 'Piraeus – Heraklion', included: false, benefit: discount('Discount'),
    path: [P.piraeus, [37.3, 24.0], [36.2, 24.6], P.heraklion] },
  { operator: 'Grimaldi Lines', name: 'Brindisi – Igoumenitsa – Patras', included: false, benefit: discount('Discount'),
    path: [P.brindisi, [40.65, 18.5], ...TO_IGOUMENITSA, P.igoumenitsa, ...TO_PATRAS, P.patras] },
  { operator: 'Grimaldi Lines', name: 'Civitavecchia – Barcelona', included: false, benefit: discount('Discount'),
    path: [P.civitavecchia, [41.6, 10.2], [41.32, 9.25], [41.1, 6.5], P.barcelona] },
  { operator: 'Blue Star Ferries', name: 'Piraeus – Paros – Naxos – Santorini', included: false,
    benefit: '30% off Greek domestic routes, after you have crossed the Adriatic with Superfast Ferries.',
    path: [P.piraeus, [37.55, 24.25], P.paros, P.naxos, P.santorini] },
  { operator: 'Blue Star Ferries', name: 'Piraeus – Kos – Rhodes', included: false,
    benefit: '30% off Greek domestic routes, after you have crossed the Adriatic with Superfast Ferries.',
    path: [P.piraeus, [37.45, 24.6], [37.0, 26.3], P.kos, [36.6, 27.9], P.rhodes] },
  { operator: 'SNAV', name: 'Ancona – Split', included: false, benefit: discount('20% discount'),
    path: [P.ancona, [43.45, 15.4], P.split] },
  { operator: 'Stena Line', name: 'Hook of Holland – Harwich', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.hook, P.harwich] },
  { operator: 'Stena Line', name: 'Dublin – Holyhead', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.dublin, P.holyhead] },
  { operator: 'Stena Line', name: 'Rosslare – Fishguard', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.rosslare, P.fishguard] },
  { operator: 'Stena Line', name: 'Belfast – Cairnryan', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.belfast, [54.75, -5.5], P.cairnryan] },
  { operator: 'Stena Line', name: 'Belfast – Liverpool', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.belfast, [54.3, -5.2], [53.7, -3.6], P.birkenhead] },
  { operator: 'Stena Line', name: 'Kiel – Gothenburg', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.kiel, [54.75, 10.65], [55.55, 10.95], [56.5, 11.6], P.gothenburg] },
  { operator: 'Stena Line', name: 'Frederikshavn – Gothenburg', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.frederikshavn, P.gothenburg] },
  { operator: 'Stena Line', name: 'Rostock – Trelleborg', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.rostock, P.trelleborg] },
  { operator: 'Stena Line', name: 'Gdynia – Karlskrona', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.gdynia, [55.2, 17.6], P.karlskrona] },
  { operator: 'Stena Line', name: 'Travemünde – Liepāja', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.travemunde, [54.5, 12.5], [55.3, 15.5], [56.0, 19.0], P.liepaja] },
  { operator: 'Stena Line', name: 'Nynäshamn – Ventspils', included: false, benefit: discount('Up to 30% off foot passenger fares'),
    path: [P.nynashamn, [58.3, 19.6], P.ventspils] },
  { operator: 'Irish Ferries', name: 'Rosslare – Pembroke', included: false, benefit: discount('About 30% off online bookings (reservation compulsory)'),
    path: [P.rosslare, [51.95, -5.6], P.pembroke] },
  { operator: 'Irish Ferries', name: 'Dublin – Cherbourg', included: false, benefit: discount('About 30% off online bookings (reservation compulsory)'),
    path: [P.dublin, [52.0, -5.95], [50.1, -5.35], [49.85, -2.6], P.cherbourg] },
  { operator: 'Polferries', name: 'Gdańsk – Nynäshamn', included: false, benefit: discount('Discounted fares'),
    path: [P.gdansk, [55.3, 19.0], [57.8, 18.9], P.nynashamn] },
  { operator: 'Polferries', name: 'Świnoujście – Ystad', included: false, benefit: discount('Discounted fares'),
    path: [P.swinoujscie, P.ystad] },
  { operator: 'Fjord Line', name: 'Hirtshals – Kristiansand', included: false, benefit: discount('Discount'),
    path: [P.hirtshals, P.kristiansand] },
  { operator: 'Fjord Line', name: 'Hirtshals – Stavanger – Bergen', included: false, benefit: discount('Discount'),
    path: [P.hirtshals, [58.0, 7.0], [58.35, 5.35], P.stavanger, [59.6, 5.1], P.bergen] },
  { operator: 'Tallink Silja', name: 'Helsinki – Tallinn', included: false, benefit: discount('Discount'),
    path: [P.helsinki, P.tallinn] },
  { operator: 'Tallink Silja', name: 'Helsinki – Stockholm', included: false, benefit: discount('Discount'),
    path: [P.helsinki, [59.95, 23.0], [59.85, 21.0], P.mariehamn, [59.65, 19.2], P.stockholm] },
  { operator: 'Tallink Silja', name: 'Turku – Stockholm', included: false, benefit: discount('Discount'),
    path: [P.turku, [60.2, 21.2], P.mariehamn, [59.6, 19.0], P.stockholm] },
  { operator: 'Tallink Silja', name: 'Riga – Stockholm', included: false, benefit: discount('Discount'),
    path: [P.riga, [57.65, 22.4], [58.55, 19.7], P.stockholm] },
]

export const FERRY_INFO_URL = 'https://www.interrail.com/en/plan-your-trip/tips-and-tricks/trains-europe/ferries'

export const FERRY_STYLE = {
  included: { color: '#0e7490', label: 'Included in the pass', hint: 'Superfast Italy–Greece: uses a travel day' },
  discount: { color: '#64748b', label: 'Discount with the pass', hint: 'Stena, Tallink Silja, Blue Star…' },
}
