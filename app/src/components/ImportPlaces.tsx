import { useRef, useState } from 'react'
import { search } from '../geocode'
import { addImportedPlaces, isDuplicate, readImportFile, type ImportedPlace } from '../importPlaces'
import type { Group, Place } from '../types'
import { GROUP_COLORS } from '../data/categories'

interface Props {
  places: Place[]
  groups: Group[]
  onClose: () => void
}

type Located = ImportedPlace & { lat: number; lng: number }
const located = (p: ImportedPlace): p is Located => p.lat != null && p.lng != null

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Import places from files of other apps (Google My Maps, Google Takeout, GPS apps, spreadsheets) */
export default function ImportPlaces({ places, groups, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const [found, setFound] = useState<ImportedPlace[] | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [layersOff, setLayersOff] = useState<Set<string>>(new Set())
  const [asGroups, setAsGroups] = useState(true)
  const [searchMissing, setSearchMissing] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ added: number; notFound: string[] } | null>(null)

  async function read(files: File[]) {
    const list: ImportedPlace[] = []
    const errs: string[] = []
    let skip = 0
    for (const file of files) {
      try {
        const r = await readImportFile(file)
        list.push(...r.places)
        skip += r.skipped
      } catch (e) {
        errs.push((e as Error).message)
      }
    }
    setFound(list)
    setSkipped(skip)
    setErrors(errs)
    setLayersOff(new Set())
    setResult(null)
  }

  const layers = new Map<string, number>()
  for (const p of found ?? []) layers.set(p.layer, (layers.get(p.layer) ?? 0) + 1)
  const chosen = (found ?? []).filter((p) => !layersOff.has(p.layer))
  const withCoords = chosen.filter(located)
  const missing = chosen.filter((p) => !located(p))
  // Already on the map, or in these files more than once
  let duplicates = 0
  const fresh: Located[] = []
  for (const p of withCoords) {
    if (isDuplicate(p, [...places, ...fresh])) duplicates++
    else fresh.push(p)
  }
  const toImport = chosen.length - (searchMissing ? 0 : missing.length) - duplicates

  async function run() {
    cancelled.current = false
    const toAdd: Located[] = [...withCoords]
    const notFound: string[] = []
    if (searchMissing && missing.length) {
      for (let i = 0; i < missing.length && !cancelled.current; i++) {
        setProgress({ done: i, total: missing.length })
        const p = missing[i]
        try {
          const hit = (await search(p.query))[0]
          if (hit) toAdd.push({ ...p, lat: hit.lat, lng: hit.lng })
          else notFound.push(p.name)
        } catch {
          notFound.push(p.name)
        }
        // The free search service allows one request per second
        if (i < missing.length - 1) await wait(1100)
      }
      setProgress(null)
      if (cancelled.current) return
    } else notFound.push(...missing.map((p) => p.name))
    const added = addImportedPlaces(toAdd, places, groups, asGroups ? GROUP_COLORS : null)
    setResult({ added, notFound })
  }

  return (
    <div className="import-places">
      <div className="row list-head">
        <h3>Import places</h3>
        <button className="ghost" onClick={onClose} disabled={!!progress}>
          Close
        </button>
      </div>

      {result ? (
        <>
          <p>
            ✓ Added <b>{result.added}</b> {result.added === 1 ? 'place' : 'places'}
            {result.added < chosen.length - result.notFound.length && ' (the others were already on your map)'}. They
            are ideas for now: add the ones you want to the trip.
          </p>
          {result.notFound.length > 0 && (
            <p className="small warn-text">
              Not found, add these by hand: {result.notFound.join(', ')}
            </p>
          )}
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </>
      ) : progress ? (
        <>
          <p>
            Finding places by name… {progress.done} of {progress.total}
          </p>
          <progress max={progress.total} value={progress.done} />
          <button onClick={() => (cancelled.current = true)}>Cancel</button>
        </>
      ) : (
        <>
          <p className="muted small">
            Bring in places you saved in other apps. Export them there first, then choose the file(s) here:
          </p>
          <ul className="muted small import-sources">
            <li>
              <b>Google My Maps:</b> map menu ⋮ → Export to KML/KMZ (layers become groups)
            </li>
            <li>
              <b>Google Maps saved lists:</b> takeout.google.com → "Saved" (CSV files) or "Maps (your places)" (JSON)
            </li>
            <li>
              <b>GPS and hiking apps, Google Earth:</b> GPX or KML waypoints
            </li>
            <li>
              <b>A spreadsheet:</b> CSV with a "name" column, and "latitude"/"longitude" or an "address" column
            </li>
          </ul>
          <button className="primary" onClick={() => fileRef.current?.click()}>
            {found ? 'Choose other files' : 'Choose files'}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".kml,.kmz,.gpx,.geojson,.json,.csv,.tsv"
            hidden
            onChange={(e) => {
              // Copy the list: clearing the input below empties it
              if (e.target.files?.length) read([...e.target.files])
              e.target.value = ''
            }}
          />

          {errors.map((e) => (
            <p key={e} className="small warn-text">
              {e}
            </p>
          ))}

          {found && found.length === 0 && errors.length === 0 && (
            <p className="small warn-text">No places found in {skipped ? 'these files (only lines or shapes)' : 'these files'}.</p>
          )}

          {found && found.length > 0 && (
            <div className="import-preview">
              <p>
                Found <b>{found.length}</b> {found.length === 1 ? 'place' : 'places'}
                {layers.size > 1 && <> in {layers.size} lists</>}:
              </p>
              {layers.size > 1 && (
                <div className="import-layers">
                  {[...layers].map(([layer, count]) => (
                    <label key={layer} className="check">
                      <input
                        type="checkbox"
                        checked={!layersOff.has(layer)}
                        onChange={() => {
                          const next = new Set(layersOff)
                          if (next.has(layer)) next.delete(layer)
                          else next.add(layer)
                          setLayersOff(next)
                        }}
                      />
                      {layer || 'No name'} <span className="muted small">({count})</span>
                    </label>
                  ))}
                </div>
              )}
              <label className="check">
                <input type="checkbox" checked={asGroups} onChange={(e) => setAsGroups(e.target.checked)} />
                Put each list into its own group
              </label>
              {missing.length > 0 && (
                <label className="check">
                  <input type="checkbox" checked={searchMissing} onChange={(e) => setSearchMissing(e.target.checked)} />
                  <span>
                    Find the {missing.length} without a location by their name
                    <span className="muted small"> (about {Math.ceil(missing.length * 1.1)} s; check them afterwards)</span>
                  </span>
                </label>
              )}
              {duplicates > 0 && (
                <p className="muted small">
                  {duplicates} {duplicates === 1 ? 'is' : 'are'} already on your map (or twice in the files) and will be skipped.
                </p>
              )}
              {skipped > 0 && (
                <p className="muted small">
                  {skipped} {skipped === 1 ? 'line or shape' : 'lines and shapes'} (routes, areas) can't be imported.
                </p>
              )}
              <button
                className="primary"
                disabled={toImport <= 0}
                onClick={run}
              >
                Import {toImport} {toImport === 1 ? 'place' : 'places'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
