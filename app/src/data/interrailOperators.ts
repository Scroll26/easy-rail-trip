// Which operators the Interrail Global Pass covers, from interrail.com
// ("Railway companies" per country and "Ferries"), checked October 2026.
// Timetable data uses formal company names ("OEBB Personenverkehr AG"), so these
// are patterns. Exclusions are checked first, so e.g. "Arriva vlaky" isn't
// mistaken for a covered Arriva company.

export type Coverage = 'covered' | 'domestic' | 'not' | 'ferry-included' | 'ferry-discount' | 'unknown'

const NOT_COVERED: RegExp[] = [
  /\bitalo\b|italo treno|nuovo trasporto viaggiatori|\bntv\b/i,
  /flixtrain|flixbus|go volta/i,
  /\bavlo\b|ouigo espa|ouigo spain/i,
  /heathrow express|london underground|flytoget|euskotren|\bfgc\b|ferrocarrils de la generalitat|\bfgv\b|serveis ferroviaris de mallorca/i,
  /circumvesuviana|\beav\b|ferrovie del sud est|sud est|circumetnea|ferrotramviaria|arenaways|trasporto ferroviario toscano|ferrovie della calabria|trentino trasporti|sangritana|tua abruzzo|udine.?cividale|\bsad\b nahverkehr|micotra/i,
  /fertagus|regiotrans|transferoviar|astra trans carpatic|softrans|ferotrafic/i,
  /arriva vlaky|gw train regio|gepard express|\bdlb\b|slezsk[eé] zemsk/i,
  /midtjyske jernbaner|x-t[aå]get|vr sverige|vr sweden/i,
  /pinzgauer|salzburger lokalbahn|zillertal|stern\s*&\s*hafferl|wiener lokalbahn|graz.?k[oö]flacher|steierm[aä]rkische landesbahn|montafon|achensee|city ?airport ?train|mariazeller|n[oö]vog|wachaubahn|waldviertel|schneeberg/i,
  /szybka kolej miejska|\bskm\b warszaw|warszawska kolej dojazdowa|\bwkd\b/i,
  /marmaray|chemins de fer de (la )?corse|chemins de fer de provence|\bratp\b|transilien/i,
  /beskydsk|ko[sš]ick[aá] detsk|nitriansk|pova[zž]sk|oravsk|[cč]iernohronsk|tren[cč]ianska elektrick/i,
]

/** Covered only on routes inside one country */
const DOMESTIC_ONLY: RegExp[] = [/westbahn/i, /regiojet/i, /leo express/i, /gysev|raaberbahn/i]

const COVERED: RegExp[] = [
  // Austria, Germany, Switzerland
  /\b[oö]bb\b|oebb|[oö]sterreichische bundesbahnen|nightjet/i,
  /\bdb\b|deutsche bahn|db fernverkehr|db regio|s-bahn|erixx|metronom|eurobahn|national express|go-ahead|vias|agilis|alex|l[aä]nderbahn|transdev|abellio|nordwestbahn|vlexx|odeg|hlb|hessische landesbahn|start\b|cantus|mitteldeutsche regiobahn|\bmrb\b|bayerische oberlandbahn|\bbob\b|bayerische regiobahn|\bbrb\b|meridian|arverio|rdc|european sleeper/i,
  /\bsbb\b|\bcff\b|\bffs\b|schweizerische bundesbahnen|\bbls\b|rh[aä]tische bahn|\brhb\b|matterhorn gotthard|\bmgb\b|s[uü]dostbahn|\bsob\b|zentralbahn|thurbo|transn|appenzeller|aare seeland|montreux oberland|\bmob\b|golden ?pass|tpf|trn|travys|jura|berner oberland|tilo/i,
  // Benelux, France, Iberia, Italy
  /\bns\b|nederlandse spoorwegen|qbuzz|keolis|\bsncb\b|\bnmbs\b|\bcfl\b|chemins de fer luxembourgeois/i,
  /\bsncf\b|\bter\b|intercit[eé]s|tgv|ouigo|l[eé]man express|lyria|eurostar|thalys|zou!/i,
  /renfe|iryo|\bcp\b|comboios de portugal|feve/i,
  /trenitalia|frecciarossa|trenord|\btper\b|ferrovienord|\bfnm\b|\bfart\b|centovalli/i,
  // UK & Ireland
  /avanti|\bc2c\b|caledonian sleeper|chiltern|cross ?country|east midlands|elizabeth line|gatwick express|grand central|greater anglia|great northern|great western|\bgwr\b|hull trains|island line|\blner\b|london north eastern|london northwestern|london overground|lumo|merseyrail|northern|scotrail|southeastern|southern|south western|stansted express|thameslink|transpennine|transport for wales|west midlands|tfl rail|iarnr[oó]d [eé]ireann|irish rail|translink|ni railways/i,
  // Nordics & Baltics
  /\bdsb\b|lokaltog|go collective|nordjyske|[oö]resundst[aå]g|\bsj\b|statens j[aä]rnv[aä]gar|sn[aä]llt[aå]get|\bvy\b|vy t[aå]g|norrt[aå]g|tagab|v[aä]rmlandstrafik|kr[oö]sat[aå]gen|v[aä]sttrafik|m[aä]lart[aå]g|sk[aå]netrafiken|p[aå]gat[aå]gen|t[aå]g i bergslagen|l[aä]nstrafiken|inlandsbanan|arlanda express|\bvr\b|vr group|\bhsl\b|elron|ltg link|pasa[zž]ieru vilciens|\bvivi\b/i,
  // Central & Eastern Europe
  /[cč]esk[eé] dr[aá]hy|\b[cč]d\b|\bzssk\b|zeleznicna spolocnost|\bm[aá]v\b|m[aá]v-start|m[aá]v szem[eé]lysz[aá]ll[ií]t[aá]si|pkp intercity|polregio|koleje (mazowieckie|[sś]l[aą]skie|dolno[sś]l[aą]skie|wielkopolskie|ma[lł]opolskie)|[lł][oó]dzka kolej|\b[lł]ka\b|skm tr[oó]jmiasto|arriva rp/i,
  /\bhzpp\b|hrvatske [zž]eljeznice|slovenske [zž]eleznice|\bs[zž]\b|cfr c[aă]l[aă]tori|\bbd[zž]\b|bulgarian state railways|srbija ?voz|\b[zž]pcg\b|\b[zž]rsm\b|\bzfbh\b|[zž]eljeznice federacije|\b[zž]rs\b|[zž]eljeznice republike srpske|\btcdd\b|hellenic train|trainose/i,
]

/** Ferries: Superfast Italy–Greece is included in the Global Pass, the others give a discount */
const FERRY_INCLUDED = /superfast/i
const FERRY_DISCOUNT = /blue star|fjord line|grimaldi|irish ferries|minoan|polferries|polska [zż]egluga|snav|stena|tallink|silja/i

export function coverage(agency: string, mode: string): Coverage {
  const a = agency.trim()
  if (mode === 'FERRY') {
    if (FERRY_INCLUDED.test(a)) return 'ferry-included'
    if (FERRY_DISCOUNT.test(a)) return 'ferry-discount'
    return 'not'
  }
  if (!a) return 'unknown'
  if (NOT_COVERED.some((r) => r.test(a))) return 'not'
  if (DOMESTIC_ONLY.some((r) => r.test(a))) return 'domestic'
  if (COVERED.some((r) => r.test(a))) return 'covered'
  return 'unknown'
}

export const COVERAGE_LABEL: Record<Coverage, { icon: string; text: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  covered: { icon: '✓', text: 'Interrail', tone: 'good' },
  domestic: { icon: '✓', text: 'Interrail (domestic routes only)', tone: 'warn' },
  'ferry-included': { icon: '✓', text: 'Included (uses a travel day, port fees extra)', tone: 'good' },
  'ferry-discount': { icon: '%', text: 'Discount with Interrail', tone: 'warn' },
  not: { icon: '✕', text: 'Not covered by Interrail', tone: 'bad' },
  unknown: { icon: '?', text: 'Not on the Interrail list: check', tone: 'neutral' },
}
