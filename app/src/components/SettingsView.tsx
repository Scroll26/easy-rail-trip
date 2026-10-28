import { useEffect, useRef, useState } from 'react'
import { loadCountries } from '../countries'
import SyncSection from './SyncSection'
import DataSection from './DataSection'
import AvoidCountries from './AvoidCountries'
import { DEFAULT_INTERRAIL_COUNTRIES } from '../data/interrail'
import { exportJson, importJson, updateSettings } from '../store'
import type { Settings } from '../types'

interface Country {
  iso: string
  name: string
}

export default function SettingsView({ settings }: { settings: Settings }) {
  const [countries, setCountries] = useState<Country[]>([])
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadCountries().then((shapes) =>
      setCountries(shapes.map(({ iso, name }) => ({ iso, name })).sort((a, b) => a.name.localeCompare(b.name))),
    )
  }, [])

  function toggleCountry(iso: string) {
    const list = settings.interrailCountries
    updateSettings({
      interrailCountries: list.includes(iso) ? list.filter((c) => c !== iso) : [...list, iso],
    })
  }

  function download() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rail-planner-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function upload(file: File) {
    try {
      const n = importJson(await file.text())
      setMessage(`Imported ${n.places} places, ${n.people} people and ${n.stops} stops.`)
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="settings">
      <SyncSection />

      <section>
        <h3>Backup</h3>
        <p className="muted small">
          Everything is saved on this device and works offline. A backup file is a copy you can keep, or import on
          another device without Google.
        </p>
        <div className="row">
          <button onClick={download}>⬇ Export backup</button>
          <button onClick={() => fileRef.current?.click()}>⬆ Import backup</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
        {message && <p className="small">{message}</p>}
      </section>

      <DataSection onExport={download} />

      <section>
        <h3>Countries to avoid</h3>
        <p className="muted small">
          Train connections are routed around these, unless you change it on a connection. Put your country of
          residence here: Interrail covers it only on the way out and back home.
        </p>
        <AvoidCountries value={settings.avoidCountries} onChange={(v) => updateSettings({ avoidCountries: v })} />
      </section>

      <section>
        <h3>Interrail countries</h3>
        <p className="muted small">
          {settings.interrailCountries.length} countries are highlighted. The defaults follow interrail.com.
          Change them here if the list changes.
        </p>
        <div className="country-grid">
          {countries.map((c) => (
            <label key={c.iso} className="check">
              <input
                type="checkbox"
                checked={settings.interrailCountries.includes(c.iso)}
                onChange={() => toggleCountry(c.iso)}
              />
              {c.name}
            </label>
          ))}
        </div>
        <button className="ghost" onClick={() => updateSettings({ interrailCountries: DEFAULT_INTERRAIL_COUNTRIES })}>
          Reset to official list
        </button>
      </section>

      <section>
        <h3>About</h3>
        <p className="muted small">
          Rail Planner is free and open source. No account, no tracking: your trip stays on your devices (and in your own
          Google Drive if you sync).
        </p>
        <div className="row">
          <a className="button" href="https://github.com/Scroll26/rail-planner#readme" target="_blank" rel="noreferrer">
            ❓ How to use
          </a>
          <a className="button" href={import.meta.env.BASE_URL + 'privacy.html'} target="_blank" rel="noreferrer">
            🔒 Privacy policy
          </a>
        </div>
      </section>
    </div>
  )
}
