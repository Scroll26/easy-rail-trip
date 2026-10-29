// Import places from files other apps export: KML/KMZ (Google My Maps, Google Earth),
// GPX (GPS and hiking apps), GeoJSON (Google Takeout "Saved places") and CSV
// (Google Takeout saved lists, spreadsheets). Only the user's own points are read;
// lines, routes and shapes are counted but not imported.
import { doc, newId, saveGroup, savePlace } from './store'
import type { Group, Place } from './types'

export interface ImportedPlace {
  name: string
  lat: number | null
  lng: number | null
  notes: string
  url: string
  /** Layer, folder or list it came from; becomes its group */
  layer: string
  /** Text to search for when there are no coordinates */
  query: string
}

export interface ImportFile {
  places: ImportedPlace[]
  /** Lines, routes and shapes that aren't imported */
  skipped: number
}

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, '')

export async function readImportFile(file: File): Promise<ImportFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'kmz') {
    const kml = await kmlFromKmz(await file.arrayBuffer())
    if (!kml) throw new Error(`${file.name}: no map data found in the KMZ file.`)
    return parseKml(kml, baseName(file))
  }
  const text = await file.text()
  if (ext === 'kml') return parseKml(text, baseName(file))
  if (ext === 'gpx') return parseGpx(text, baseName(file))
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return parseCsv(text, baseName(file))
  if (ext === 'json' || ext === 'geojson') return parseGeoJson(text, baseName(file))
  // Unknown extension: guess from the content
  const start = text.trimStart()
  if (start.startsWith('{')) return parseGeoJson(text, baseName(file))
  if (/<kml[\s>]/.test(start.slice(0, 500))) return parseKml(text, baseName(file))
  if (/<gpx[\s>]/.test(start.slice(0, 500))) return parseGpx(text, baseName(file))
  throw new Error(`${file.name}: unknown file type. Use KML, KMZ, GPX, GeoJSON or CSV.`)
}

// ---- Shared helpers ----

const num = (s: unknown) => {
  const n = typeof s === 'number' ? s : parseFloat(String(s ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const validCoords = (lat: number | null, lng: number | null) =>
  lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)

/** Coordinates inside a Google Maps (or similar) link, if it has any */
export function coordsFromUrl(url: string): { lat: number; lng: number } | null {
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) {
      const lat = Number(m[1])
      const lng = Number(m[2])
      if (validCoords(lat, lng)) return { lat, lng }
    }
  }
  return null
}

/** Text of an HTML description (My Maps and Google Earth use HTML) */
function htmlText(html: string) {
  if (!/[<&]/.test(html)) return html.trim()
  const d = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html')
  return (d.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

function place(p: Partial<ImportedPlace> & { name: string; layer: string }): ImportedPlace {
  let lat = p.lat ?? null
  let lng = p.lng ?? null
  if (!validCoords(lat, lng)) {
    const fromUrl = p.url ? coordsFromUrl(p.url) : null
    lat = fromUrl?.lat ?? null
    lng = fromUrl?.lng ?? null
  }
  return {
    name: p.name.trim() || 'Unnamed place',
    lat,
    lng,
    notes: p.notes?.trim() ?? '',
    url: p.url?.trim() ?? '',
    layer: p.layer.trim(),
    query: p.query?.trim() || p.name.trim(),
  }
}

function xml(text: string) {
  const d = new DOMParser().parseFromString(text, 'application/xml')
  if (d.querySelector('parsererror')) throw new Error("The file couldn't be read (broken XML).")
  return d
}

/** Direct child element by local name (ignores namespaces) */
const child = (el: Element, name: string) => [...el.children].find((c) => c.localName === name)
const childText = (el: Element, name: string) => child(el, name)?.textContent?.trim() ?? ''
const all = (el: Element | Document, name: string) => [...el.getElementsByTagNameNS('*', name)]

// ---- KML / KMZ ----

function parseKml(text: string, fallbackLayer: string): ImportFile {
  const d = xml(text)
  const docName = all(d, 'Document')[0] ? childText(all(d, 'Document')[0], 'name') : ''
  const places: ImportedPlace[] = []
  let skipped = 0
  for (const pm of all(d, 'Placemark')) {
    const point = all(pm, 'Point')[0]
    if (!point) {
      skipped++
      continue
    }
    const [lng, lat] = (all(point, 'coordinates')[0]?.textContent ?? '').trim().split(/[\s,]+/).map(Number)
    // The closest folder (a My Maps layer) names the group
    let folder: Element | null = pm.parentElement
    while (folder && folder.localName !== 'Folder') folder = folder.parentElement
    const extended = all(pm, 'Data')
      .map((dt) => [dt.getAttribute('name') ?? '', childText(dt, 'value')] as const)
      .filter(([k, v]) => v && !/^(name|description|gx_media_links)$/i.test(k))
    const description = htmlText(childText(pm, 'description'))
    const url = description.match(/https?:\/\/\S+/)?.[0] ?? ''
    places.push(
      place({
        name: childText(pm, 'name'),
        lat,
        lng,
        notes: [description, ...extended.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n'),
        url,
        layer: (folder && childText(folder, 'name')) || docName || fallbackLayer,
        query: [childText(pm, 'name'), childText(pm, 'address')].filter(Boolean).join(', '),
      }),
    )
  }
  return { places, skipped }
}

/** The KML document inside a KMZ (a zip file) */
async function kmlFromKmz(buf: ArrayBuffer): Promise<string | null> {
  const view = new DataView(buf)
  // End of central directory: the last 22+ bytes
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('The KMZ file is damaged.')
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const entries: { name: string; method: number; size: number; offset: number }[] = []
  for (let n = 0; n < count && view.getUint32(at, true) === 0x02014b50; n++) {
    const nameLen = view.getUint16(at + 28, true)
    entries.push({
      method: view.getUint16(at + 10, true),
      size: view.getUint32(at + 20, true),
      offset: view.getUint32(at + 42, true),
      name: new TextDecoder().decode(new Uint8Array(buf, at + 46, nameLen)),
    })
    at += 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  const kmls = entries.filter((e) => e.name.toLowerCase().endsWith('.kml'))
  const entry = kmls.find((e) => e.name.toLowerCase() === 'doc.kml') ?? kmls[0]
  if (!entry) return null
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  const data = new Uint8Array(buf, start, entry.size)
  if (entry.method === 0) return new TextDecoder().decode(data)
  if (entry.method !== 8) throw new Error('The KMZ file uses an unsupported compression.')
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

// ---- GPX ----

function parseGpx(text: string, fallbackLayer: string): ImportFile {
  const d = xml(text)
  const meta = all(d, 'metadata')[0]
  const layer = (meta && childText(meta, 'name')) || fallbackLayer
  const places = all(d, 'wpt').map((w) => {
    const link = all(w, 'link')[0]?.getAttribute('href') ?? ''
    return place({
      name: childText(w, 'name'),
      lat: num(w.getAttribute('lat')),
      lng: num(w.getAttribute('lon')),
      notes: [childText(w, 'desc'), childText(w, 'cmt')].filter((v, i, a) => v && a.indexOf(v) === i).join('\n'),
      url: link,
      layer,
    })
  })
  return { places, skipped: all(d, 'rte').length + all(d, 'trk').length }
}

// ---- GeoJSON (incl. Google Takeout "Saved places" / "Labeled places") ----

interface Feature {
  type?: string
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: Record<string, unknown> | null
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

function parseGeoJson(text: string, fallbackLayer: string): ImportFile {
  let data: { type?: string; features?: Feature[]; name?: string }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("The file couldn't be read (broken JSON).")
  }
  if (data?.type === 'Feature') data = { type: 'FeatureCollection', features: [data as Feature] }
  if (!Array.isArray(data?.features)) throw new Error("This JSON file doesn't contain map data (GeoJSON).")
  const layer = str(data.name) || fallbackLayer
  const places: ImportedPlace[] = []
  let skipped = 0
  for (const f of data.features) {
    const g = f.geometry
    const p = f.properties ?? {}
    // Takeout: { location: { name, address }, google_maps_url, Comment } or older
    // { Title, Location: { "Business Name", Address, "Geo Coordinates": { Latitude, Longitude } } }
    const loc = (p.location ?? p.Location ?? {}) as Record<string, unknown>
    const geo = (loc['Geo Coordinates'] ?? {}) as Record<string, unknown>
    if (g && g.type !== 'Point') {
      skipped++
      continue
    }
    const coords = Array.isArray(g?.coordinates) ? (g.coordinates as unknown[]) : []
    let lat = num(coords[1])
    let lng = num(coords[0])
    if (!validCoords(lat, lng)) {
      lat = num(geo.Latitude ?? loc.latitude)
      lng = num(geo.Longitude ?? loc.longitude)
    }
    const name =
      str(p.name ?? p.Name ?? p.title ?? p.Title) || str(loc.name ?? loc['Business Name']) || str(loc.address ?? loc.Address)
    const address = str(loc.address ?? loc.Address)
    places.push(
      place({
        name,
        lat,
        lng,
        notes: [str(p.description ?? p.Description), str(p.Comment ?? p.comment ?? p.note ?? p.Note), address && name !== address ? address : '']
          .filter(Boolean)
          .join('\n'),
        url: str(p.google_maps_url ?? p['Google Maps URL'] ?? p.url ?? p.URL),
        layer,
        query: [name, address].filter(Boolean).join(', '),
      }),
    )
  }
  return { places, skipped }
}

// ---- CSV ----

/** Rows of a CSV (comma, semicolon or tab separated, with "quoted" fields) */
function csvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0]
  const sep = ['\t', ';', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  return rows.filter((r) => r.some((f) => f.trim()))
}

const COLUMNS = {
  name: ['name', 'title', 'place', 'business name', 'location name', 'label'],
  lat: ['lat', 'latitude', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'x'],
  wkt: ['wkt', 'geometry'],
  notes: ['notes', 'note', 'description', 'desc', 'comment', 'comments'],
  url: ['url', 'link', 'google maps url', 'website'],
  layer: ['group', 'list', 'folder', 'layer', 'category'],
  address: ['address', 'city', 'country'],
}

function parseCsv(text: string, fallbackLayer: string): ImportFile {
  const rows = csvRows(text.trimStart()) // also drops a byte order mark
  if (rows.length < 2) throw new Error('The CSV file has no rows.')
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (names: string[]) => head.findIndex((h) => names.includes(h))
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, col(names)])) as Record<
    keyof typeof COLUMNS,
    number
  >
  // Several address-like columns (address, city, country) all help the search
  const addressCols = head.map((h, i) => (COLUMNS.address.includes(h) ? i : -1)).filter((i) => i >= 0)
  if (idx.name < 0 && idx.lat < 0 && idx.wkt < 0)
    throw new Error('The CSV file needs a "name" (or "title") column, or "latitude" and "longitude" columns.')
  const places = rows.slice(1).map((r) => {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
    let lat = num(get(idx.lat))
    let lng = num(get(idx.lng))
    const wkt = get(idx.wkt).match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)/i)
    if (wkt) {
      lng = Number(wkt[1])
      lat = Number(wkt[2])
    }
    const address = addressCols.map(get).filter(Boolean).join(', ')
    const name = get(idx.name) || address
    return place({
      name,
      lat,
      lng,
      notes: [get(idx.notes), address && address !== name ? address : ''].filter(Boolean).join('\n'),
      url: get(idx.url),
      layer: get(idx.layer) || fallbackLayer,
      query: [name, address !== name ? address : ''].filter(Boolean).join(', '),
    })
  })
  return { places, skipped: 0 }
}

// ---- Adding them to the trip ----

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = Math.PI / 180
  const x = (b.lng - a.lng) * toRad * Math.cos(((a.lat + b.lat) / 2) * toRad)
  const y = (b.lat - a.lat) * toRad
  return Math.sqrt(x * x + y * y) * 6371000
}

/** Same name close by, or practically the same spot */
type Point = { name: string; lat: number; lng: number }

export function isDuplicate(p: Point, existing: Point[]) {
  const name = p.name.trim().toLowerCase()
  return existing.some((e) => {
    const d = metres(p, e)
    return d < 25 || (d < 1000 && e.name.trim().toLowerCase() === name)
  })
}

/**
 * Adds the places (they must have coordinates). With `groupColors`, each layer becomes a
 * place group (an existing group with that name is reused). Returns how many were added.
 */
export function addImportedPlaces(
  list: (ImportedPlace & { lat: number; lng: number })[],
  existing: Place[],
  groups: Group[],
  groupColors: string[] | null,
) {
  const groupIds = new Map<string, string>()
  const kept: Place[] = []
  const now = Date.now()
  doc.transact(() => {
    let colorIndex = groups.filter((g) => g.kind === 'place').length
    for (const p of list) {
      if (isDuplicate(p, [...existing, ...kept])) continue
      let groupId: string | null = null
      if (groupColors && p.layer) {
        const key = p.layer.toLowerCase()
        groupId =
          groupIds.get(key) ??
          groups.find((g) => g.kind === 'place' && g.name.toLowerCase() === key)?.id ??
          null
        if (!groupId) {
          groupId = newId()
          saveGroup({ id: groupId, kind: 'place', name: p.layer, color: groupColors[colorIndex++ % groupColors.length], createdAt: now })
        }
        groupIds.set(key, groupId)
      }
      const created = now + kept.length
      const item: Place = {
        id: newId(),
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        category: 'other',
        status: 'idea',
        notes: p.notes,
        url: p.url,
        groupId,
        createdAt: created,
        updatedAt: created,
      }
      savePlace(item)
      kept.push(item)
    }
  })
  return kept.length
}
