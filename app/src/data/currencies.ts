// Currency used in each country on the map (ISO 3166 → ISO 4217).
// Bulgaria switched to the euro on 1 January 2026. Montenegro and Kosovo use the euro without being in the eurozone.
export const COUNTRY_CURRENCY: Record<string, string> = {
  AD: 'EUR', AL: 'ALL', AT: 'EUR', AX: 'EUR', BA: 'BAM', BE: 'EUR', BG: 'EUR', BY: 'BYN',
  CH: 'CHF', CY: 'EUR', CZ: 'CZK', DE: 'EUR', DK: 'DKK', EE: 'EUR', ES: 'EUR', FI: 'EUR',
  FO: 'DKK', FR: 'EUR', GB: 'GBP', GG: 'GBP', GI: 'GIP', GR: 'EUR', HR: 'EUR', HU: 'HUF',
  IE: 'EUR', IM: 'GBP', IS: 'ISK', IT: 'EUR', JE: 'GBP', LI: 'CHF', LT: 'EUR', LU: 'EUR',
  LV: 'EUR', MC: 'EUR', MD: 'MDL', ME: 'EUR', MK: 'MKD', MT: 'EUR', NL: 'EUR', NO: 'NOK',
  PL: 'PLN', PT: 'EUR', RO: 'RON', RS: 'RSD', SE: 'SEK', SI: 'EUR', SK: 'EUR', SM: 'EUR',
  TR: 'TRY', UA: 'UAH', VA: 'EUR', XK: 'EUR',
}

/** Small territories whose label would only clutter the map (their currency matches a bigger neighbour) */
export const NO_CURRENCY_LABEL = new Set(['AD', 'AX', 'FO', 'GG', 'GI', 'IM', 'JE', 'LI', 'MC', 'SM', 'VA'])

export const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'Euro', ALL: 'Albanian lek', BAM: 'Convertible mark', BYN: 'Belarusian ruble', CHF: 'Swiss franc',
  CZK: 'Czech koruna', DKK: 'Danish krone', GBP: 'Pound sterling', GIP: 'Gibraltar pound',
  HUF: 'Hungarian forint', ISK: 'Icelandic króna', MDL: 'Moldovan leu', MKD: 'Macedonian denar',
  NOK: 'Norwegian krone', PLN: 'Polish złoty', RON: 'Romanian leu', RSD: 'Serbian dinar',
  SEK: 'Swedish krona', TRY: 'Turkish lira', UAH: 'Ukrainian hryvnia',
}

/** Map colour + everyday symbol per currency. Neighbouring countries get clearly different colours. */
export const CURRENCY_STYLE: Record<string, { color: string; symbol: string }> = {
  EUR: { color: '#3b82f6', symbol: '€' },
  GBP: { color: '#8b5cf6', symbol: '£' },
  GIP: { color: '#8b5cf6', symbol: '£' },
  CHF: { color: '#ef4444', symbol: 'Fr.' },
  CZK: { color: '#c2410c', symbol: 'Kč' },
  PLN: { color: '#eab308', symbol: 'zł' },
  HUF: { color: '#22c55e', symbol: 'Ft' },
  DKK: { color: '#ec4899', symbol: 'kr' },
  NOK: { color: '#0e7490', symbol: 'kr' },
  SEK: { color: '#f59e0b', symbol: 'kr' },
  ISK: { color: '#0ea5e9', symbol: 'kr' },
  RON: { color: '#a855f7', symbol: 'lei' },
  RSD: { color: '#be123c', symbol: 'дин' },
  BAM: { color: '#84cc16', symbol: 'KM' },
  MKD: { color: '#d946ef', symbol: 'ден' },
  ALL: { color: '#fb923c', symbol: 'L' },
  TRY: { color: '#dc2626', symbol: '₺' },
  UAH: { color: '#78716c', symbol: '₴' },
  BYN: { color: '#9333ea', symbol: 'Br' },
  MDL: { color: '#10b981', symbol: 'L' },
}
