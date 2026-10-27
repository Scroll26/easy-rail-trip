import { useState } from 'react'
import { search } from '../geocode'
import { deletePerson, savePerson } from '../store'
import type { Person } from '../types'

interface Props {
  person: Person
  onClose: () => void
  onPickOnMap: () => void
  onLocated: (lat: number, lng: number) => void
}

export default function PersonEditor({ person, onClose, onPickOnMap, onLocated }: Props) {
  const [status, setStatus] = useState('')
  const set = (patch: Partial<Person>) => savePerson({ ...person, ...patch })

  async function locate() {
    const query = person.precision === 'address' && person.address
      ? `${person.address}, ${person.city}`
      : person.city
    if (!query.trim()) {
      setStatus('Enter a city first.')
      return
    }
    setStatus('Searching…')
    try {
      const [hit] = await search(query)
      if (!hit) {
        setStatus('Nothing found. Try a different spelling or pick on the map.')
        return
      }
      set({ lat: hit.lat, lng: hit.lng })
      setStatus(`Pinned at: ${hit.label}`)
      onLocated(hit.lat, hit.lng)
    } catch {
      setStatus('Search needs an internet connection. You can pick on the map instead.')
    }
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Person · saved automatically</span>
      </div>

      <label className="field">
        <span>Name</span>
        <input value={person.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Anna" />
      </label>

      <label className="field">
        <span>City</span>
        <input value={person.city} onChange={(e) => set({ city: e.target.value })} placeholder="e.g. Kraków" />
      </label>

      <div className="field">
        <span>Pin location</span>
        <div className="segmented">
          <button className={person.precision === 'city' ? 'active' : ''} onClick={() => set({ precision: 'city' })}>
            Just the city
          </button>
          <button className={person.precision === 'address' ? 'active' : ''} onClick={() => set({ precision: 'address' })}>
            Exact address
          </button>
        </div>
      </div>

      {person.precision === 'address' && (
        <label className="field">
          <span>Address</span>
          <input
            value={person.address}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="Street and number"
          />
        </label>
      )}

      <div className="row">
        <button className="primary" onClick={locate}>🔎 Find on map</button>
        <button onClick={onPickOnMap}>📍 Pick on map</button>
      </div>
      {status && <p className="muted small">{status}</p>}
      {person.lat == null && !status && (
        <p className="muted small">Not on the map yet. Find the city, or pick a spot on the map.</p>
      )}

      <label className="check">
        <input type="checkbox" checked={person.canStay} onChange={(e) => set({ canStay: e.target.checked })} />
        I can stay with them (free accommodation)
      </label>

      <label className="field">
        <span>Contact</span>
        <input
          value={person.contact}
          onChange={(e) => set({ contact: e.target.value })}
          placeholder="Phone, Instagram, email…"
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={4}
          value={person.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="When they're around, what to bring…"
        />
      </label>

      <div className="row">
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Remove ${person.name || 'this person'}?`)) {
              deletePerson(person.id)
              onClose()
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
